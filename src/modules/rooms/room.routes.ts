import { Router } from "express";
import * as roomController from "./room.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const roomRouter = Router();

roomRouter.use(authenticate);

roomRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), roomController.list);
roomRouter.get("/:id", roomController.getById);
roomRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), roomController.create);
roomRouter.put("/:id", requireRole("ADMIN", "SUPER_ADMIN"), roomController.update);
