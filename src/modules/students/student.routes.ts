import { Router } from "express";
import * as studentController from "./student.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const studentRouter = Router();

studentRouter.use(authenticate);

studentRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), studentController.list);
studentRouter.get("/:id", studentController.getById);
studentRouter.put("/:id", studentController.update);
studentRouter.get("/:id/allocation", studentController.getAllocation);
