import { Router } from "express";
import * as appController from "./application.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const applicationRouter = Router();

applicationRouter.use(authenticate);

// Student routes
applicationRouter.post("/", requireRole("STUDENT"), appController.create);
applicationRouter.get("/my", requireRole("STUDENT"), appController.getMy);
applicationRouter.patch("/:id/my", requireRole("STUDENT"), appController.updateMy);

// Admin routes
applicationRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), appController.list);
applicationRouter.post("/run-allocation", requireRole("ADMIN", "SUPER_ADMIN"), appController.runAllocation);
applicationRouter.patch("/:id/edit-override", requireRole("DORM_HEAD", "SUPER_ADMIN"), appController.setEditOverride);
applicationRouter.get("/:id", appController.getById);
applicationRouter.put("/:id/review", requireRole("ADMIN", "SUPER_ADMIN"), appController.review);
