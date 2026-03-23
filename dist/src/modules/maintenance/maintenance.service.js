"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequest = createRequest;
exports.listRequests = listRequests;
exports.getMyRequests = getMyRequests;
exports.getRequestById = getRequestById;
exports.updateRequest = updateRequest;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
async function createRequest(userId, dto) {
    return database_1.prisma.maintenanceRequest.create({
        data: { ...dto, reportedById: userId },
    });
}
async function listRequests(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.priority)
        where.priority = query.priority;
    if (query.category)
        where.category = query.category;
    const [requests, total] = await database_1.prisma.$transaction([
        database_1.prisma.maintenanceRequest.findMany({
            where,
            skip,
            take,
            include: {
                room: { include: { dorm: { select: { name: true } } } },
                reportedBy: { select: { email: true } },
                assignedTo: { select: { firstName: true, lastName: true } },
            },
            orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        }),
        database_1.prisma.maintenanceRequest.count({ where }),
    ]);
    return { requests, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getMyRequests(userId, query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const [requests, total] = await database_1.prisma.$transaction([
        database_1.prisma.maintenanceRequest.findMany({
            where: { reportedById: userId },
            skip,
            take,
            include: { room: { include: { dorm: { select: { name: true } } } } },
            orderBy: { createdAt: "desc" },
        }),
        database_1.prisma.maintenanceRequest.count({ where: { reportedById: userId } }),
    ]);
    return { requests, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getRequestById(id) {
    const req = await database_1.prisma.maintenanceRequest.findUnique({
        where: { id },
        include: {
            room: { include: { dorm: true } },
            reportedBy: { select: { email: true } },
            assignedTo: true,
        },
    });
    if (!req)
        throw Object.assign(new Error("Maintenance request not found"), { statusCode: 404 });
    return req;
}
async function updateRequest(id, adminId, dto) {
    const data = {};
    if (dto.status !== undefined) {
        data.status = dto.status;
        if (dto.status === "RESOLVED")
            data.resolvedAt = new Date();
    }
    if (dto.priority !== undefined)
        data.priority = dto.priority;
    if (dto.assignedToId !== undefined) {
        const admin = await database_1.prisma.admin.findUnique({ where: { userId: adminId } });
        if (!admin)
            throw Object.assign(new Error("Admin not found"), { statusCode: 404 });
        data.assignedToId = admin.id;
    }
    return database_1.prisma.maintenanceRequest.update({ where: { id }, data });
}
