import { Router } from "express";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate);

maintenanceRouter.post("/", maintenanceController.create);
maintenanceRouter.get("/my", maintenanceController.getMy);
maintenanceRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), maintenanceController.list);
maintenanceRouter.get("/:id", maintenanceController.getById);
maintenanceRouter.put("/:id", requireRole("ADMIN", "SUPER_ADMIN"), maintenanceController.update);
