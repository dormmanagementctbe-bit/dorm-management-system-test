"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRooms = listRooms;
exports.getRoomById = getRoomById;
exports.createRoom = createRoom;
exports.updateRoom = updateRoom;
const prisma_1 = require("../../../generated/prisma");
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
async function listRooms(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.dormId)
        where.dormId = query.dormId;
    const [rooms, total] = await database_1.prisma.$transaction([
        database_1.prisma.room.findMany({ where, skip, take, include: { dorm: { select: { name: true } } }, orderBy: { roomNumber: "asc" } }),
        database_1.prisma.room.count({ where }),
    ]);
    return { rooms, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getRoomById(id) {
    const room = await database_1.prisma.room.findUnique({
        where: { id },
        include: { dorm: true },
    });
    if (!room)
        throw Object.assign(new Error("Room not found"), { statusCode: 404 });
    return room;
}
async function createRoom(dto) {
    return database_1.prisma.room.create({ data: { ...dto, monthlyRate: new prisma_1.Prisma.Decimal(dto.monthlyRate) } });
}
async function updateRoom(id, dto) {
    const data = { ...dto };
    if (dto.monthlyRate !== undefined)
        data.monthlyRate = new prisma_1.Prisma.Decimal(dto.monthlyRate);
    return database_1.prisma.room.update({ where: { id }, data });
}
