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

  const now = new Date();
  if (now < academicYear.applicationOpen || now > academicYear.applicationClose) {
    throw Object.assign(new Error("Applications are not open at this time"), { statusCode: 400 });
  }

  const priorityScore = calculatePriorityScore(student, { submittedAt: now }, academicYear);

  const application = await prisma.dormApplication.create({
    data: {
      studentId: student.id,
      academicYearId: academicYear.id,
      preferredDormId: dto.preferredDormId,
      reason: dto.reason,
      priorityScore,
    },
  });

  await notifyUser(student.userId, {
    title: "Application Submitted",
    message: `Your dorm application for ${academicYear.label} has been submitted. Priority score: ${priorityScore.toFixed(1)}`,
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
        student: { select: { firstName: true, lastName: true, studentId: true } },
        academicYear: { select: { label: true } },
        preferredDorm: { select: { name: true } },
      },
      orderBy: { priorityScore: "desc" },
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
    include: { academicYear: true, preferredDorm: true, allocation: true },
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
      preferredDorm: true,
      allocation: { include: { room: { include: { dorm: true } } } },
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
  if (app.status !== "PENDING") {
    throw Object.assign(new Error("Only PENDING applications can be reviewed"), { statusCode: 400 });
  }

  const admin = await prisma.admin.findUnique({ where: { userId: adminId } });
  if (!admin) throw Object.assign(new Error("Admin profile not found"), { statusCode: 404 });

  const updated = await prisma.dormApplication.update({
    where: { id },
    data: {
      status: dto.status,
      reviewNote: dto.reviewNote,
      reviewedById: admin.id,
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
  const admin = await prisma.admin.findUnique({ where: { userId: adminId } });
  if (!admin) throw Object.assign(new Error("Admin profile not found"), { statusCode: 404 });

  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw Object.assign(new Error("No active academic year"), { statusCode: 400 });

  // Fetch all PENDING applications ordered by priority score DESC
  const applications = await prisma.dormApplication.findMany({
    where: { academicYearId: academicYear.id, status: "PENDING" },
    include: { student: true, preferredDorm: { include: { rooms: true } } },
    orderBy: { priorityScore: "desc" },
  });

  // Fetch rooms with current occupant counts
  const rooms = await prisma.room.findMany({
    where: { status: "AVAILABLE" },
    include: {
      dorm: true,
      allocations: { where: { status: { in: ["ACTIVE", "PENDING_CHECKIN"] } } },
    },
  });

  let allocated = 0;
  let waitlisted = 0;

  for (const application of applications) {
    // Find an available room with capacity
    const room = rooms.find((r) => {
      const occupants = r.allocations.length;
      const hasSpace = occupants < r.capacity;
      // Respect preferred dorm if specified
      if (application.preferredDormId && r.dormId !== application.preferredDormId) return false;
      return hasSpace;
    }) ?? rooms.find((r) => r.allocations.length < r.capacity);

    if (!room) {
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
          roomId: room.id,
          applicationId: application.id,
          academicYearId: academicYear.id,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
          allocatedById: admin.id,
        },
      });

      await tx.dormApplication.update({
        where: { id: application.id },
        data: { status: "ALLOCATED" },
      });

      // Mark room occupied if full after this allocation
      const newOccupants = room.allocations.length + 1;
      if (newOccupants >= room.capacity) {
        await tx.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } });
      }
    });

    // Track this allocation locally to avoid re-assigning the same room slot
    room.allocations.push({} as never);

    await notifyUser(application.student.userId, {
      title: "Room Allocated",
      message: `You have been allocated a room in ${room.dorm.name}, Room ${room.roomNumber} for ${academicYear.label}.`,
      type: "ALLOCATION",
    });

    allocated++;
  }

  return { allocated, waitlisted, total: applications.length };
}
