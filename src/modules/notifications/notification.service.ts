import { NotificationType } from "../../../generated/prisma";
import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";

interface NotifyPayload {
  title: string;
  message: string;
  type: NotificationType;
}

export async function notifyUser(userId: string, payload: NotifyPayload) {
  return prisma.notification.create({
    data: {
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
    },
  });
}

export async function getMyNotifications(userId: string, query: { page?: string; limit?: string }) {
  const { skip, take, page, limit } = parsePagination(query);

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return { notifications, meta: buildMeta(total, page, limit) };
}

export async function markRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
