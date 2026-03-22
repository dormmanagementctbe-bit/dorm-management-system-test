import { Router } from "express";
import * as notificationController from "./notification.controller";
import { authenticate } from "../../middleware/auth.middleware";

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get("/my", notificationController.getMy);
notificationRouter.put("/read-all", notificationController.markAllRead);
notificationRouter.put("/:id/read", notificationController.markRead);
