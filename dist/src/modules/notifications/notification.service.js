"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyUser = notifyUser;
exports.getMyNotifications = getMyNotifications;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
async function notifyUser(userId, payload) {
    return database_1.prisma.notification.create({
        data: {
            userId,
            title: payload.title,
            message: payload.message,
            type: payload.type,
        },
    });
}
async function getMyNotifications(userId, query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const [notifications, total] = await database_1.prisma.$transaction([
        database_1.prisma.notification.findMany({
            where: { userId },
            skip,
            take,
            orderBy: { createdAt: "desc" },
        }),
        database_1.prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function markRead(id, userId) {
    return database_1.prisma.notification.updateMany({
        where: { id, userId },
        data: { isRead: true },
    });
}
async function markAllRead(userId) {
    return database_1.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
    });
}
