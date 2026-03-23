"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaintenanceSchema = exports.createMaintenanceSchema = void 0;
const zod_1 = require("zod");
exports.createMaintenanceSchema = zod_1.z.object({
    roomId: zod_1.z.string().uuid(),
    category: zod_1.z.enum(["PLUMBING", "ELECTRICAL", "HVAC", "FURNITURE", "CLEANING", "OTHER"]),
    priority: zod_1.z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    title: zod_1.z.string().min(3).max(200),
    description: zod_1.z.string().min(10).max(2000),
});
exports.updateMaintenanceSchema = zod_1.z.object({
    status: zod_1.z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"]).optional(),
    priority: zod_1.z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    assignedToId: zod_1.z.string().uuid().optional(),
});
