"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApplication = createApplication;
exports.listApplications = listApplications;
exports.getMyApplications = getMyApplications;
exports.getApplicationById = getApplicationById;
exports.reviewApplication = reviewApplication;
exports.runAllocation = runAllocation;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
const priority_service_1 = require("../../services/priority.service");
const notification_service_1 = require("../notifications/notification.service");
// ─── Student submits application ────────────────────────────────────────────
async function createApplication(userId, dto) {
    const student = await database_1.prisma.student.findUnique({ where: { userId } });
    if (!student)
        throw Object.assign(new Error("Student profile not found"), { statusCode: 404 });
    const academicYear = await database_1.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!academicYear)
        throw Object.assign(new Error("No active academic year found"), { statusCode: 400 });
    const now = new Date();
    if (now < academicYear.applicationOpen || now > academicYear.applicationClose) {
        throw Object.assign(new Error("Applications are not open at this time"), { statusCode: 400 });
    }
    const priorityScore = (0, priority_service_1.calculatePriorityScore)(student, { submittedAt: now }, academicYear);
    const application = await database_1.prisma.dormApplication.create({
        data: {
            studentId: student.id,
            academicYearId: academicYear.id,
            preferredDormId: dto.preferredDormId,
            reason: dto.reason,
            priorityScore,
        },
    });
    await (0, notification_service_1.notifyUser)(student.userId, {
        title: "Application Submitted",
        message: `Your dorm application for ${academicYear.label} has been submitted. Priority score: ${priorityScore.toFixed(1)}`,
        type: "APPLICATION",
    });
    return application;
}
// ─── Admin lists all applications ───────────────────────────────────────────
async function listApplications(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.academicYearId)
        where.academicYearId = query.academicYearId;
    const [applications, total] = await database_1.prisma.$transaction([
        database_1.prisma.dormApplication.findMany({
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
        database_1.prisma.dormApplication.count({ where }),
    ]);
    return { applications, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
// ─── Student views own applications ─────────────────────────────────────────
async function getMyApplications(userId) {
    const student = await database_1.prisma.student.findUnique({ where: { userId } });
    if (!student)
        throw Object.assign(new Error("Student profile not found"), { statusCode: 404 });
    return database_1.prisma.dormApplication.findMany({
        where: { studentId: student.id },
        include: { academicYear: true, preferredDorm: true, allocation: true },
        orderBy: { submittedAt: "desc" },
    });
}
// ─── Get single application ──────────────────────────────────────────────────
async function getApplicationById(id) {
    const app = await database_1.prisma.dormApplication.findUnique({
        where: { id },
        include: {
            student: true,
            academicYear: true,
            preferredDorm: true,
            allocation: { include: { room: { include: { dorm: true } } } },
        },
    });
    if (!app)
        throw Object.assign(new Error("Application not found"), { statusCode: 404 });
    return app;
}
// ─── Admin reviews application ───────────────────────────────────────────────
async function reviewApplication(id, adminId, dto) {
    const app = await database_1.prisma.dormApplication.findUnique({
        where: { id },
        include: { student: true },
    });
    if (!app)
        throw Object.assign(new Error("Application not found"), { statusCode: 404 });
    if (app.status !== "PENDING") {
        throw Object.assign(new Error("Only PENDING applications can be reviewed"), { statusCode: 400 });
    }
    const admin = await database_1.prisma.admin.findUnique({ where: { userId: adminId } });
    if (!admin)
        throw Object.assign(new Error("Admin profile not found"), { statusCode: 404 });
    const updated = await database_1.prisma.dormApplication.update({
        where: { id },
        data: {
            status: dto.status,
            reviewNote: dto.reviewNote,
            reviewedById: admin.id,
            reviewedAt: new Date(),
        },
    });
    await (0, notification_service_1.notifyUser)(app.student.userId, {
        title: "Application Updated",
        message: `Your dorm application status has been updated to: ${dto.status}${dto.reviewNote ? `. Note: ${dto.reviewNote}` : ""}`,
        type: "APPLICATION",
    });
    return updated;
}
// ─── Admin triggers auto-allocation ─────────────────────────────────────────
async function runAllocation(adminId) {
    const admin = await database_1.prisma.admin.findUnique({ where: { userId: adminId } });
    if (!admin)
        throw Object.assign(new Error("Admin profile not found"), { statusCode: 404 });
    const academicYear = await database_1.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!academicYear)
        throw Object.assign(new Error("No active academic year"), { statusCode: 400 });
    // Fetch all PENDING applications ordered by priority score DESC
    const applications = await database_1.prisma.dormApplication.findMany({
        where: { academicYearId: academicYear.id, status: "PENDING" },
        include: { student: true, preferredDorm: { include: { rooms: true } } },
        orderBy: { priorityScore: "desc" },
    });
    // Fetch rooms with current occupant counts
    const rooms = await database_1.prisma.room.findMany({
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
            if (application.preferredDormId && r.dormId !== application.preferredDormId)
                return false;
            return hasSpace;
        }) ?? rooms.find((r) => r.allocations.length < r.capacity);
        if (!room) {
            await database_1.prisma.dormApplication.update({
                where: { id: application.id },
                data: { status: "WAITLISTED" },
            });
            waitlisted++;
            continue;
        }
        // Create allocation
        await database_1.prisma.$transaction(async (tx) => {
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
        room.allocations.push({});
        await (0, notification_service_1.notifyUser)(application.student.userId, {
            title: "Room Allocated",
            message: `You have been allocated a room in ${room.dorm.name}, Room ${room.roomNumber} for ${academicYear.label}.`,
            type: "ALLOCATION",
        });
        allocated++;
    }
    return { allocated, waitlisted, total: applications.length };
}
