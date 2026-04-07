import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { CreateApplicationDto, ReviewApplicationDto } from "./application.dto";
import { calculatePriorityScore } from "../../services/priority.service";
import { notifyUser } from "../notifications/notification.service";

// ─── Student submits application ────────────────────────────────────────────

export async function createApplication(userId: string, dto: CreateApplicationDto) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw Object.assign(new Error("Student profile not found"), { statusCode: 404 });

  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw Object.assign(new Error("No active academic year found"), { statusCode: 400 });

  const semester = await prisma.semester.findFirst({
    where: { id: dto.semesterId, academicYearId: academicYear.id, isActive: true },
  });
  if (!semester) throw Object.assign(new Error("Invalid or inactive semester"), { statusCode: 400 });

  const now = new Date();
  if (now < academicYear.applicationOpenDate || now > academicYear.applicationCloseDate) {
    throw Object.assign(new Error("Applications are not open at this time"), { statusCode: 400 });
  }

  const scores = calculatePriorityScore(student, { submittedAt: now }, academicYear);

  const application = await prisma.dormApplication.create({
    data: {
      studentId: student.id,
      academicYearId: academicYear.id,
      semesterId: semester.id,
      currentCity: dto.currentCity,
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
    },
  });

  await notifyUser(student.userId, {
    title: "Application Submitted",
    message: `Your dorm application for ${academicYear.label} has been submitted.`,
    type: "APPLICATION",
  });

  return application;
}

// ─── Admin lists all applications ───────────────────────────────────────────

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
        student: { select: { firstName: true, lastName: true, studentNumber: true } },
        academicYear: { select: { label: true } },
        preferences: { include: { dorm: { select: { name: true } } } },
      },
      orderBy: { finalPriorityScore: "desc" },
    }),
    prisma.dormApplication.count({ where }),
  ]);

  return { applications, meta: buildMeta(total, page, limit) };
}

// ─── Student views own applications ─────────────────────────────────────────

export async function getMyApplications(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw Object.assign(new Error("Student profile not found"), { statusCode: 404 });

  return prisma.dormApplication.findMany({
    where: { studentId: student.id },
    include: { academicYear: true, semester: true, preferences: { include: { dorm: true } }, allocation: true },
    orderBy: { submittedAt: "desc" },
  });
}

// ─── Get single application ──────────────────────────────────────────────────

export async function getApplicationById(id: string) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: {
      student: true,
      academicYear: true,
      semester: true,
      preferences: { include: { dorm: true } },
      allocation: { include: { bed: { include: { room: { include: { dorm: true } } } } } },
    },
  });
  if (!app) throw Object.assign(new Error("Application not found"), { statusCode: 404 });
  return app;
}

// ─── Admin reviews application ───────────────────────────────────────────────

export async function reviewApplication(id: string, adminId: string, dto: ReviewApplicationDto) {
  const app = await prisma.dormApplication.findUnique({
    where: { id },
    include: { student: true },
  });
  if (!app) throw Object.assign(new Error("Application not found"), { statusCode: 404 });
  if (app.status !== "SUBMITTED") {
    throw Object.assign(new Error("Only SUBMITTED applications can be reviewed"), { statusCode: 400 });
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

// ─── Admin triggers auto-allocation ─────────────────────────────────────────

export async function runAllocation(adminId: string) {
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw Object.assign(new Error("No active academic year"), { statusCode: 400 });

  // Fetch all APPROVED applications ordered by final priority score DESC.
  const applications = await prisma.dormApplication.findMany({
    where: { academicYearId: academicYear.id, status: "APPROVED" },
    include: { student: { select: { userId: true } }, preferences: true },
    orderBy: { finalPriorityScore: "desc" },
  });

  // Fetch active beds with current occupant counts.
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

    // Create allocation
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

    // Track this allocation locally to avoid re-assigning the same bed slot.
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
