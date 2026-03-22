import { Router } from "express";
import * as allocationController from "./allocation.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const allocationRouter = Router();

allocationRouter.use(authenticate);

allocationRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), allocationController.list);
allocationRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), allocationController.create);
allocationRouter.get("/:id", allocationController.getById);
allocationRouter.put("/:id/status", requireRole("ADMIN", "SUPER_ADMIN"), allocationController.updateStatus);
allocationRouter.get("/:id/pdf", allocationController.getPdf);
