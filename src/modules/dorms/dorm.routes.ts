import { Router } from "express";
import * as dormController from "./dorm.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const dormRouter = Router();

dormRouter.use(authenticate);

dormRouter.get("/", dormController.list);
dormRouter.get("/:id/details", dormController.getDetails);
dormRouter.get("/:id", dormController.getById);
dormRouter.get("/:id/beds", dormController.getBeds);
dormRouter.get("/:id/rooms", dormController.getRooms);
dormRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), dormController.create);
dormRouter.put("/:id", requireRole("ADMIN", "SUPER_ADMIN"), dormController.update);
