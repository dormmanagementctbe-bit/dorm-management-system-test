import { Router } from "express";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate);

maintenanceRouter.post("/", requireRole("STUDENT"), maintenanceController.create);
maintenanceRouter.get("/my", maintenanceController.getMy);
maintenanceRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN", "MAINTENANCE"), maintenanceController.list);
maintenanceRouter.post("/:id/confirm-fixed", requireRole("STUDENT"), maintenanceController.confirmFixed);
maintenanceRouter.get("/:id", maintenanceController.getById);
maintenanceRouter.put("/:id", requireRole("ADMIN", "SUPER_ADMIN", "MAINTENANCE"), maintenanceController.update);
maintenanceRouter.patch("/:id", requireRole("ADMIN", "SUPER_ADMIN", "MAINTENANCE"), maintenanceController.update);
