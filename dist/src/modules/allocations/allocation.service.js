"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAllocations = listAllocations;
exports.getAllocationById = getAllocationById;
exports.createAllocation = createAllocation;
exports.updateAllocationStatus = updateAllocationStatus;
exports.getAllocationPdf = getAllocationPdf;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
const pdf_service_1 = require("../../services/pdf.service");
async function listAllocations(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.academicYearId)
        where.academicYearId = query.academicYearId;
    const [allocations, total] = await database_1.prisma.$transaction([
        database_1.prisma.allocation.findMany({
            where,
            skip,
            take,
            include: {
                student: { select: { firstName: true, lastName: true, studentId: true } },
                room: { include: { dorm: { select: { name: true } } } },
                academicYear: { select: { label: true } },
            },
            orderBy: { createdAt: "desc" },
        }),
        database_1.prisma.allocation.count({ where }),
    ]);
    return { allocations, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getAllocationById(id) {
    const allocation = await database_1.prisma.allocation.findUnique({
        where: { id },
        include: {
            student: { include: { user: { select: { email: true } } } },
            room: { include: { dorm: true } },
            academicYear: true,
            allocatedBy: { select: { firstName: true, lastName: true } },
        },
    });
    if (!allocation)
        throw Object.assign(new Error("Allocation not found"), { statusCode: 404 });
    return allocation;
}
async function createAllocation(adminId, dto) {
    const admin = await database_1.prisma.admin.findUnique({ where: { userId: adminId } });
    if (!admin)
        throw Object.assign(new Error("Admin profile not found"), { statusCode: 404 });
    return database_1.prisma.allocation.create({
        data: {
            studentId: dto.studentId,
            roomId: dto.roomId,
            applicationId: dto.applicationId,
            academicYearId: dto.academicYearId,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            allocatedById: admin.id,
        },
    });
}
async function updateAllocationStatus(id, dto) {
    return database_1.prisma.allocation.update({ where: { id }, data: { status: dto.status } });
}
async function getAllocationPdf(id) {
    const allocation = await getAllocationById(id);
    return (0, pdf_service_1.generateAllocationPdf)(allocation);
}
