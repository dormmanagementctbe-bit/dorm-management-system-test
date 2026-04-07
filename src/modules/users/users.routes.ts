import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as usersController from "./users.controller";

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get("/me", usersController.getMe);
usersRouter.patch("/me", usersController.updateMe);
usersRouter.delete("/me", usersController.deactivateMe);

usersRouter.get("/", requireRole("ADMIN", "SUPER_ADMIN"), usersController.list);
usersRouter.get("/:id", requireRole("ADMIN", "SUPER_ADMIN"), usersController.getById);
usersRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), usersController.create);
usersRouter.patch("/:id", requireRole("ADMIN", "SUPER_ADMIN"), usersController.updateById);
usersRouter.delete("/:id", requireRole("ADMIN", "SUPER_ADMIN"), usersController.deactivate);
usersRouter.patch(
  "/:id/reactivate",
  requireRole("ADMIN", "SUPER_ADMIN"),
  usersController.reactivate
);
