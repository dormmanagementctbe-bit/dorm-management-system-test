import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import {
  CreateApplicationDto,
  ReviewApplicationDto,
  SetEditOverrideDto,
  UpdateApplicationDto,
} from "./application.dto";
import { calculatePriorityScore } from "../../services/priority.service";
import { notifyUser } from "../notifications/notification.service";

function toHttpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function isApplicationEditable(app: {
  status: string;
  canEditUntil: Date | null;
  editOverrideUntil: Date | null;
}) {
  if (app.status !== "SUBMITTED") return false;

  const now = new Date();
  if (app.editOverrideUntil && app.editOverrideUntil > now) {
    return true;
  }

  return Boolean(app.canEditUntil && app.canEditUntil > now);
}

// Student submits application
export async function createApplication(userId: string, dto: CreateApplicationDto) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw toHttpError("Student profile not found", 404);

  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw toHttpError("No active academic year found", 400);

  const semester = await prisma.semester.findFirst({
    where: { id: dto.semesterId, academicYearId: academicYear.id, isActive: true },
  });
  if (!semester) throw toHttpError("Invalid or inactive semester", 400);

  const now = new Date();
  if (now < academicYear.applicationOpenDate || now > academicYear.applicationCloseDate) {
    throw toHttpError("Applications are not open at this time", 400);
  }

  const existingApplication = await prisma.dormApplication.findFirst({
    where: {
      studentId: student.id,
      academicYearId: academicYear.id,
    },
    select: { id: true },
  });

  if (existingApplication) {
    throw toHttpError("Only one application is allowed per academic year", 409);
  }

  const scores = calculatePriorityScore(student, { submittedAt: now }, academicYear);

  const application = await prisma.dormApplication.create({
    data: {
      studentId: student.id,
      academicYearId: academicYear.id,
      semesterId: semester.id,
      currentCity: dto.currentCity,
      currentSubcity: dto.currentSubcity,
      currentWoreda: dto.currentWoreda,
      hasDisability: dto.hasDisability,
      disabilityType: dto.disabilityType,
      medicalConditions: dto.medicalConditions,
      canEditUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      reason: dto.reason,
      basePriorityScore: scores.basePriorityScore,
      disabilityBonusScore: scores.disabilityBonusScore,
      finalPriorityScore: scores.finalPriorityScore,
      preferences: dto.preferredDormIds
        ? {
            create: dto.preferredDormIds.map((dormId, index) => ({
              dormId,
              preferenceRank: index + 1,
            })),
          }
        : undefined,
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
    include: {
      documents: true,
      preferences: true,
    },
  });

  await notifyUser(student.userId, {
    title: "Application Submitted",
    message: `Your dorm application for ${academicYear.label} has been submitted.`,
    type: "APPLICATION",
  });

  return application;
}

// Student updates own application inside edit window
export async function updateMyApplication(userId: string, applicationId: string, dto: UpdateApplicationDto) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw toHttpError("Student profile not found", 404);

  const existing = await prisma.dormApplication.findFirst({
    where: {
      id: applicationId,
      studentId: student.id,
    },
    include: {
      documents: true,
    },
  });

  if (!existing) {
    throw toHttpError("Application not found", 404);
  }

  if (!isApplicationEditable(existing)) {
    throw toHttpError("Application is no longer editable", 403);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (dto.documents) {
      await tx.applicationDocument.deleteMany({
        where: {
          applicationId,
        },
      });

      await tx.applicationDocument.createMany({
        data: dto.documents.map((document) => ({
          applicationId,
          type: document.type,
          originalName: document.originalName,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          status: "UPLOADED",
        })),
      });
    }

    if (dto.preferredDormIds) {
      await tx.applicationPreference.deleteMany({ where: { applicationId } });
      await tx.applicationPreference.createMany({
        data: dto.preferredDormIds.map((dormId, index) => ({
          applicationId,
          dormId,
          preferenceRank: index + 1,
        })),
      });
    }

    return tx.dormApplication.update({
      where: { id: applicationId },
      data: {
        currentSubcity: dto.currentSubcity,
        currentWoreda: dto.currentWoreda,
        hasDisability: dto.hasDisability,
        disabilityType: dto.disabilityType === null ? null : dto.disabilityType,
        medicalConditions: dto.medicalConditions,
        reason: dto.reason,
      },
      include: {
        documents: true,
        preferences: { include: { dorm: true } },
      },
    });
  });

  return updated;
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
      include: {
        student: { select: { firstName: true, grandfatherName: true, studentNumber: true } },
        academicYear: { select: { label: true } },
        preferences: { include: { dorm: { select: { name: true } } } },
        documents: true,
      },
      orderBy: { finalPriorityScore: "desc" },
    }),
    prisma.dormApplication.count({ where }),
  ]);

  return { applications, meta: buildMeta(total, page, limit) };
}

// Student views own applications
export async function getMyApplications(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw toHttpError("Student profile not found", 404);

  return prisma.dormApplication.findMany({
    where: { studentId: student.id },
    include: {
      academicYear: true,
      semester: true,
      preferences: { include: { dorm: true } },
      documents: true,
      allocation: true,
    },
    orderBy: { submittedAt: "desc" },
  });
}

// Get single application
export async function getApplicationById(id: string) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: {
      student: true,
      academicYear: true,
      semester: true,
      documents: true,
      preferences: { include: { dorm: true } },
      allocation: { include: { bed: { include: { room: { include: { dorm: true } } } } } },
    },
  });
  if (!app) throw toHttpError("Application not found", 404);
  return app;
}

// Admin reviews application
export async function reviewApplication(id: string, adminId: string, dto: ReviewApplicationDto) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: { student: true },
  });
  if (!app) throw toHttpError("Application not found", 404);
  if (app.status !== "SUBMITTED") {
    throw toHttpError("Only SUBMITTED applications can be reviewed", 400);
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

  const applications = await prisma.dormApplication.findMany({
    where: { academicYearId: academicYear.id, status: "APPROVED" },
    include: { student: { select: { userId: true } }, preferences: true },
    orderBy: { finalPriorityScore: "desc" },
  });

  const beds = await prisma.bed.findMany({
    where: { status: "AVAILABLE", isActive: true },
    include: {
      room: { include: { dorm: true } },
      allocations: { where: { status: { in: ["ACTIVE", "PENDING_CHECKIN"] } } },
    },
  });

  let allocated = 0;
  let waitlisted = 0;

  for (const application of applications) {
    const preferredDormIds = application.preferences
      .sort((a, b) => a.preferenceRank - b.preferenceRank)
      .map((p) => p.dormId);

    const bed = beds.find((b) => preferredDormIds.includes(b.room.dormId) && b.allocations.length === 0)
      ?? beds.find((b) => b.allocations.length === 0);

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
          applicationId: application.id,
          academicYearId: academicYear.id,
          semesterId: application.semesterId,
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
      message: `You have been allocated Bed ${bed.bedNumber} in ${bed.room.dorm.name}, Room ${bed.room.roomNumber} for ${academicYear.label}.`,
      type: "ALLOCATION",
    });

    allocated++;
  }

  return { allocated, waitlisted, total: applications.length };
}
