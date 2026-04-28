import { Prisma } from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { attachCompatibilityRoomToAllocation } from "../../utils/dorm-compat";
import {
  CreateApplicationDto,
  ReviewApplicationDto,
  SetEditOverrideDto,
  UpdateApplicationDto,
} from "./application.dto";
import { calculatePriorityScore } from "../../services/priority.service";
import { notifyUser } from "../notifications/notification.service";

const APPLICATION_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REFERENCE_NUMBER_ATTEMPTS = 5;

const applicationInclude = {
  student: {
    select: {
      id: true,
      userId: true,
      studentNumber: true,
      department: true,
      guardianName: true,
      guardianPhone: true,
    },
  },
  academicYear: {
    select: {
      id: true,
      label: true,
      startDate: true,
      endDate: true,
      applicationOpenDate: true,
      applicationCloseDate: true,
      isActive: true,
    },
  },
  documents: true,
  allocation: {
    include: {
      bed: {
        include: {
          dorm: { include: { block: true } },
        },
      },
      dorm: { include: { block: true } },
    },
  },
} satisfies Prisma.DormApplicationInclude;

function toHttpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function isApplicationEditable(app: {
  status: string;
  canEditUntil: Date | null;
  editOverrideUntil: Date | null;
}) {
  if (app.status !== "PENDING") return false;

  const now = new Date();
  if (app.editOverrideUntil && app.editOverrideUntil > now) {
    return true;
  }

  return Boolean(app.canEditUntil && app.canEditUntil > now);
}

function isPrismaUniqueError(err: unknown): err is { code: string; meta?: { target?: string[] } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function isReferenceNumberConflict(err: unknown) {
  if (!isPrismaUniqueError(err)) return false;

  const targets = err.meta?.target ?? [];
  return targets.some((target) => target === "reference_number" || target === "referenceNumber");
}

function buildSubmissionReceipt(application: {
  studentFullName: string | null;
  referenceNumber: string | null;
  submittedAt: Date;
}) {
  return {
    studentFullName: application.studentFullName,
    referenceNumber: application.referenceNumber,
    submittedAt: application.submittedAt,
  };
}

function normalizeAcademicYearLabel(label: string) {
  return label.trim().replace(/\s+/g, "");
}

function buildAcademicYearLabelCandidates(label: string) {
  const normalized = normalizeAcademicYearLabel(label);
  const candidates = new Set<string>([normalized, normalized.replace(/-/g, "/"), normalized.replace(/\//g, "-")]);

  const slashMatch = normalized.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const startYear = slashMatch[1];
    const endYear = slashMatch[2].length === 2 ? `${startYear.slice(0, 2)}${slashMatch[2]}` : slashMatch[2];

    candidates.add(`${startYear}/${slashMatch[2]}`);
    candidates.add(`${startYear}-${slashMatch[2]}`);
    candidates.add(`${startYear}/${endYear}`);
    candidates.add(`${startYear}-${endYear}`);
  }

  const dashMatch = normalized.match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (dashMatch) {
    const startYear = dashMatch[1];
    const endYear = dashMatch[2].length === 2 ? `${startYear.slice(0, 2)}${dashMatch[2]}` : dashMatch[2];

    candidates.add(`${startYear}/${dashMatch[2]}`);
    candidates.add(`${startYear}-${dashMatch[2]}`);
    candidates.add(`${startYear}/${endYear}`);
    candidates.add(`${startYear}-${endYear}`);
  }

  return [...candidates].filter(Boolean);
}

async function decorateApplications<T extends { allocation?: unknown | null }>(applications: T[]) {
  return applications.map((application) => {
    if (!application.allocation || typeof application.allocation !== "object") {
      return application;
    }

    const allocation = application.allocation as { bed?: { dorm?: unknown } };
    if (!allocation.bed?.dorm) {
      return application;
    }

    return {
      ...application,
      allocation: attachCompatibilityRoomToAllocation(
        application.allocation as {
          bed: { dorm: Parameters<typeof attachCompatibilityRoomToAllocation>[0]["bed"]["dorm"] };
        }
      ),
    };
  });
}

async function resolveAcademicYearByLabel(label: string) {
  const candidates = buildAcademicYearLabelCandidates(label);
  const normalized = normalizeAcademicYearLabel(label);

  const academicYear = await prisma.academicYear.findFirst({
    where: {
      OR: [
        ...candidates.map((candidate) => ({ label: candidate })),
        {
          AND: [
            { label: { contains: normalized.slice(0, 4) } },
            { label: { contains: normalized.slice(-2) } },
          ],
        },
      ],
    },
  });

  if (!academicYear) {
    const availableAcademicYears = await prisma.academicYear.findMany({
      select: { label: true },
      orderBy: { startDate: "asc" },
      take: 10,
    });

    if (availableAcademicYears.length === 0) {
      throw toHttpError(
        `Academic year ${label} was not found because no academic years are configured yet. Create one in academic_years first.`,
        400
      );
    }

    const availableLabels = availableAcademicYears.map((item) => item.label).join(", ");
    throw toHttpError(`Academic year ${label} was not found. Available academic years: ${availableLabels}`, 400);
  }

  return academicYear;
}

function ensureAcademicYearAcceptingApplications(academicYear: {
  applicationOpenDate: Date;
  applicationCloseDate: Date;
}) {
  const now = new Date();
  if (now < academicYear.applicationOpenDate || now > academicYear.applicationCloseDate) {
    throw toHttpError("Applications are not open for the selected academic year", 400);
  }
}

async function ensureNoDuplicateApplication(studentId: string, academicYearId: string, excludeId?: string) {
  const existingApplication = await prisma.dormApplication.findFirst({
    where: {
      studentId,
      academicYearId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existingApplication) {
    throw toHttpError("Only one application is allowed per academic year", 409);
  }
}

async function syncStudentProfileFromApplication(
  tx: Prisma.TransactionClient,
  studentId: string,
  data: {
    studentNumber?: string;
    department?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
  }
) {
  const studentUpdate: Prisma.StudentUpdateInput = {
    ...(data.studentNumber !== undefined ? { studentNumber: data.studentNumber } : {}),
    ...(data.department !== undefined ? { department: data.department } : {}),
    ...(data.guardianName !== undefined ? { guardianName: data.guardianName } : {}),
    ...(data.guardianPhone !== undefined ? { guardianPhone: data.guardianPhone } : {}),
  };

  if (Object.keys(studentUpdate).length === 0) {
    return;
  }

  await tx.student.update({
    where: { id: studentId },
    data: studentUpdate,
  });
}

async function generateReferenceNumber(tx: Prisma.TransactionClient, submittedAt: Date) {
  const year = submittedAt.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));

  const totalSubmittedThisYear = await tx.dormApplication.count({
    where: {
      submittedAt: {
        gte: start,
        lt: end,
      },
    },
  });

  return `REQ-${year}-${String(totalSubmittedThisYear + 1).padStart(4, "0")}`;
}

async function findActiveSemesterForAcademicYear(academicYearId: string) {
  const semester = await prisma.semester.findFirst({
    where: {
      academicYearId,
      isActive: true,
    },
    orderBy: {
      startDate: "asc",
    },
  });

  if (!semester) {
    throw toHttpError("No active semester is configured for the active academic year", 400);
  }

  return semester;
}

function buildDocumentCreateManyInput(applicationId: string, documents: CreateApplicationDto["documents"]) {
  return documents.map((document) => ({
    applicationId,
    type: document.type,
    originalName: document.originalName,
    storagePath: document.storagePath,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: "UPLOADED" as const,
  }));
}

// Student submits application
export async function createApplication(userId: string, dto: CreateApplicationDto) {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      studyYear: true,
    },
  });
  if (!student) throw toHttpError("Student profile not found", 404);

  const academicYear = await resolveAcademicYearByLabel(dto.academicYear);
  ensureAcademicYearAcceptingApplications(academicYear);
  await ensureNoDuplicateApplication(student.id, academicYear.id);

  const submittedAt = new Date();
  const hasDisability = dto.disabilityTags?.length ? true : dto.hasDisability ?? false;
  const hasMedicalCondition =
    dto.medicalConditionTags?.length || dto.medicalCondition?.length
      ? true
      : dto.hasMedicalCondition ?? false;
  const scores = calculatePriorityScore(
    { studyYear: student.studyYear, hasDisability },
    { submittedAt },
    academicYear
  );

  for (let attempt = 0; attempt < MAX_REFERENCE_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      const application = await prisma.$transaction(async (tx) => {
        await syncStudentProfileFromApplication(tx, student.id, {
          studentNumber: dto.studentNumber,
          department: dto.department,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
        });

        const referenceNumber = await generateReferenceNumber(tx, submittedAt);

        return tx.dormApplication.create({
          select: {
            studentFullName: true,
            referenceNumber: true,
            submittedAt: true,
          },
          data: {
            studentFullName: dto.studentFullName,
            referenceNumber,
            currentSubcity: dto.location.currentSubcity,
            currentWoreda: dto.location.currentWoreda ?? null,
            hasDisability,
            hasMedicalCondition,
            disabilityTags: dto.disabilityTags ?? [],
            medicalConditionTags: dto.medicalConditionTags ?? [],
            medicalCondition: dto.medicalCondition ?? null,
            canEditUntil: new Date(submittedAt.getTime() + APPLICATION_EDIT_WINDOW_MS),
            submittedAt,
            basePriorityScore: scores.basePriorityScore,
            disabilityBonusScore: scores.disabilityBonusScore,
            finalPriorityScore: scores.finalPriorityScore,
            student: {
              connect: { id: student.id },
            },
            academicYear: {
              connect: { id: academicYear.id },
            },
            documents: {
              create: dto.documents.map((document) => ({
                type: document.type,
                originalName: document.originalName,
                storagePath: document.storagePath,
                mimeType: document.mimeType,
                sizeBytes: document.sizeBytes,
                status: "UPLOADED",
              })),
            },
          },
        });
      }) as {
        studentFullName: string | null;
        referenceNumber: string | null;
        submittedAt: Date;
      };

      await notifyUser(student.userId, {
        title: "Application Submitted",
        message: `Your dorm application for ${academicYear.label} has been submitted.`,
        type: "APPLICATION",
      });

      return buildSubmissionReceipt(application);
    } catch (err) {
      if (isReferenceNumberConflict(err) && attempt < MAX_REFERENCE_NUMBER_ATTEMPTS - 1) {
        continue;
      }

      throw err;
    }
  }

  throw toHttpError("Unable to generate an application reference number", 500);
}

// Student updates own application inside edit window
export async function updateMyApplication(userId: string, applicationId: string, dto: UpdateApplicationDto) {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw toHttpError("Student profile not found", 404);

  const existing = await prisma.dormApplication.findFirst({
    where: {
      id: applicationId,
      studentId: student.id,
    },
    select: {
      id: true,
      status: true,
      canEditUntil: true,
      editOverrideUntil: true,
      academicYearId: true,
    },
  });

  if (!existing) {
    throw toHttpError("Application not found", 404);
  }

  if (!isApplicationEditable(existing)) {
    throw toHttpError("Application is no longer editable", 403);
  }

  let nextAcademicYearId = existing.academicYearId;
  if (dto.academicYear) {
    const academicYear = await resolveAcademicYearByLabel(dto.academicYear);
    ensureAcademicYearAcceptingApplications(academicYear);
    await ensureNoDuplicateApplication(student.id, academicYear.id, applicationId);
    nextAcademicYearId = academicYear.id;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (dto.documents) {
      await tx.applicationDocument.deleteMany({
        where: {
          applicationId,
        },
      });

      await tx.applicationDocument.createMany({
        data: buildDocumentCreateManyInput(applicationId, dto.documents),
      });
    }

    await syncStudentProfileFromApplication(tx, student.id, {
      studentNumber: dto.studentNumber,
      department: dto.department,
      guardianName: dto.guardianName,
      guardianPhone: dto.guardianPhone,
    });

    const nextHasDisability =
      dto.hasDisability !== undefined
        ? dto.hasDisability
        : dto.disabilityTags !== undefined
          ? dto.disabilityTags.length > 0
          : undefined;
    const nextHasMedicalCondition =
      dto.hasMedicalCondition !== undefined
        ? dto.hasMedicalCondition
        : dto.medicalConditionTags !== undefined || dto.medicalCondition !== undefined
          ? Boolean(dto.medicalConditionTags?.length || dto.medicalCondition?.length)
          : undefined;

    return tx.dormApplication.update({
      where: { id: applicationId },
      data: {
        ...(dto.academicYear !== undefined
          ? {
              academicYear: {
                connect: { id: nextAcademicYearId },
              },
            }
          : {}),
        ...(dto.studentFullName !== undefined ? { studentFullName: dto.studentFullName } : {}),
        ...(dto.location?.currentSubcity !== undefined ? { currentSubcity: dto.location.currentSubcity } : {}),
        ...(dto.location?.currentWoreda !== undefined ? { currentWoreda: dto.location.currentWoreda } : {}),
        ...(nextHasDisability !== undefined ? { hasDisability: nextHasDisability } : {}),
        ...(nextHasMedicalCondition !== undefined
          ? { hasMedicalCondition: nextHasMedicalCondition }
          : {}),
        ...(dto.disabilityTags !== undefined ? { disabilityTags: dto.disabilityTags } : {}),
        ...(dto.medicalConditionTags !== undefined
          ? { medicalConditionTags: dto.medicalConditionTags }
          : {}),
        ...(dto.medicalCondition !== undefined ? { medicalCondition: dto.medicalCondition } : {}),
      },
      include: applicationInclude,
    });
  });

  return (await decorateApplications([updated]))[0];
}

// Admin lists all applications
export async function listApplications(query: {
  page?: string;
  limit?: string;
  status?: string;
  academicYearId?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.academicYearId) where.academicYearId = query.academicYearId;

  const [applications, total] = await prisma.$transaction([
    prisma.dormApplication.findMany({
      where,
      skip,
      take,
      include: applicationInclude,
      orderBy: { finalPriorityScore: "desc" },
    }),
    prisma.dormApplication.count({ where }),
  ]);

  return {
    applications: await decorateApplications(applications),
    meta: buildMeta(total, page, limit),
  };
}

// Student views own applications
export async function getMyApplications(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw toHttpError("Student profile not found", 404);

  const applications = await prisma.dormApplication.findMany({
    where: { studentId: student.id },
    include: applicationInclude,
    orderBy: { submittedAt: "desc" },
  });

  return decorateApplications(applications);
}

// Get single application
export async function getApplicationById(id: string) {
  const application = await prisma.dormApplication.findUnique({
    where: { id },
    include: applicationInclude,
  });
  if (!application) throw toHttpError("Application not found", 404);

  return (await decorateApplications([application]))[0];
}

// Admin reviews application
export async function reviewApplication(id: string, adminId: string, dto: ReviewApplicationDto) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: { student: true },
  });
  if (!app) throw toHttpError("Application not found", 404);
  if (app.status !== "PENDING") {
    throw toHttpError("Only PENDING applications can be reviewed", 400);
  }

  const updated = await prisma.dormApplication.update({
    where: { id },
    data: {
      status: dto.status,
      reviewNote: dto.reviewNote,
      reviewedByUserId: adminId,
      reviewedAt: new Date(),
    },
  });

  await notifyUser(app.student.userId, {
    title: "Application Updated",
    message: `Your dorm application status has been updated to: ${dto.status}${dto.reviewNote ? `. Note: ${dto.reviewNote}` : ""}`,
    type: "APPLICATION",
  });

  return updated;
}

export async function setApplicationEditOverride(id: string, adminId: string, dto: SetEditOverrideDto) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: {
      student: true,
    },
  });

  if (!app) {
    throw toHttpError("Application not found", 404);
  }

  const updated = await prisma.dormApplication.update({
    where: { id },
    data: {
      editOverrideUntil: dto.editOverrideUntil,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminId,
      entityName: "DormApplication",
      entityId: id,
      action: "APPLICATION_EDIT_OVERRIDE_SET",
      newValues: {
        editOverrideUntil: dto.editOverrideUntil.toISOString(),
      },
    },
  });

  await notifyUser(app.student.userId, {
    title: "Application Edit Window Updated",
    message: "Your application edit window has been updated by the dorm office.",
    type: "APPLICATION",
  });

  return updated;
}

// Admin triggers auto-allocation
export async function runAllocation(adminId: string) {
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw toHttpError("No active academic year", 400);

  const activeSemester = await findActiveSemesterForAcademicYear(academicYear.id);

  const applications = await prisma.dormApplication.findMany({
    where: { academicYearId: academicYear.id, status: "APPROVED" },
    include: { student: { select: { userId: true } } },
    orderBy: { finalPriorityScore: "desc" },
  });

  const beds = await prisma.bed.findMany({
    where: { status: "AVAILABLE", isActive: true },
    include: {
      dorm: { include: { block: true } },
      allocations: { where: { status: { in: ["ACTIVE", "PENDING_CHECKIN"] } } },
    },
    orderBy: { createdAt: "asc" },
  });

  let allocated = 0;
  let waitlisted = 0;

  for (const application of applications) {
    const bed = beds.find((candidate) => candidate.allocations.length === 0);

    if (!bed) {
      await prisma.dormApplication.update({
        where: { id: application.id },
        data: { status: "WAITLISTED" },
      });
      waitlisted++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.allocation.create({
        data: {
          studentId: application.studentId,
          bedId: bed.id,
          dormId: bed.dormId,
          blockId: bed.dorm.blockId,
          applicationId: application.id,
          academicYearId: academicYear.id,
          semesterId: activeSemester.id,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
          allocatedByUserId: adminId,
        },
      });

      await tx.dormApplication.update({
        where: { id: application.id },
        data: { status: "ALLOCATED" },
      });

      await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });
    });

    bed.allocations.push({} as never);

    await notifyUser(application.student.userId, {
      title: "Room Allocated",
      message: `You have been allocated Bed ${bed.bedNumber} in ${bed.dorm.name}, Room ${bed.dorm.code} for ${academicYear.label}.`,
      type: "ALLOCATION",
    });

    allocated++;
  }

  return { allocated, waitlisted, total: applications.length };
}
