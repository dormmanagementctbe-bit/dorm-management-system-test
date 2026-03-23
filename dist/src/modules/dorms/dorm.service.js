"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDorms = listDorms;
exports.getDormById = getDormById;
exports.createDorm = createDorm;
exports.updateDorm = updateDorm;
exports.getDormRooms = getDormRooms;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
async function listDorms(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = query.active !== undefined ? { isActive: query.active === "true" } : {};
    const [dorms, total] = await database_1.prisma.$transaction([
        database_1.prisma.dorm.findMany({ where, skip, take, orderBy: { name: "asc" } }),
        database_1.prisma.dorm.count({ where }),
    ]);
    return { dorms, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getDormById(id) {
    const dorm = await database_1.prisma.dorm.findUnique({ where: { id } });
    if (!dorm)
        throw Object.assign(new Error("Dorm not found"), { statusCode: 404 });
    return dorm;
}
async function createDorm(dto) {
    return database_1.prisma.dorm.create({ data: dto });
}
async function updateDorm(id, dto) {
    return database_1.prisma.dorm.update({ where: { id }, data: dto });
}
async function getDormRooms(dormId, query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = { dormId };
    if (query.status)
        where.status = query.status;
    const [rooms, total] = await database_1.prisma.$transaction([
        database_1.prisma.room.findMany({ where, skip, take, orderBy: { roomNumber: "asc" } }),
        database_1.prisma.room.count({ where }),
    ]);
    return { rooms, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
