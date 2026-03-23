import { Request, Response, NextFunction } from "express";
import * as notificationService from "./notification.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function getMy(req: Request, res: Response, next: NextFunction) {
  try {
    const { notifications, meta } = await notificationService.getMyNotifications(
      req.user!.id,
      req.query as Record<string, string>
    );
    sendPaginated(res, notifications, meta);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await notificationService.markRead(id, req.user!.id);
    sendSuccess(res, null, "Notification marked as read");
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await notificationService.markAllRead(req.user!.id);
    sendSuccess(res, null, "All notifications marked as read");
  } catch (err) {
    next(err);
  }
}
