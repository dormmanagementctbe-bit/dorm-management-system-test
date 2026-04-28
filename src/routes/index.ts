import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { studentRouter } from "../modules/students/student.routes";
import { dormRouter } from "../modules/dorms/dorm.routes";
import { roomRouter } from "../modules/rooms/room.routes";
import { applicationRouter } from "../modules/applications/application.routes";
import { allocationRouter } from "../modules/allocations/allocation.routes";
import { maintenanceRouter } from "../modules/maintenance/maintenance.routes";
import { notificationRouter } from "../modules/notifications/notification.routes";
import { usersRouter } from "../modules/users/users.routes";
import { bedRouter } from "../modules/beds/bed.routes";
import { uploadRouter } from "../modules/uploads/upload.routes";

export const router = Router();

router.use("/auth", authRouter);
router.use("/students", studentRouter);
router.use("/dorms", dormRouter);
router.use("/rooms", roomRouter);
router.use("/applications", applicationRouter);
router.use("/allocations", allocationRouter);
router.use("/maintenance", maintenanceRouter);
router.use("/notifications", notificationRouter);
router.use("/users", usersRouter);
router.use("/beds", bedRouter);
router.use("/uploads", uploadRouter);
