"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    role: zod_1.z.enum(["STUDENT", "ADMIN"]).default("STUDENT"),
    // Student-specific fields
    studentId: zod_1.z.string().optional(),
    firstName: zod_1.z.string().min(1).optional(),
    lastName: zod_1.z.string().min(1).optional(),
    academicYear: zod_1.z.coerce.number().int().min(1).max(5).optional(),
    department: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    distanceKm: zod_1.z.coerce.number().min(0).optional(),
    costSharingEligible: zod_1.z.boolean().optional(),
    // Admin-specific fields
    adminLevel: zod_1.z.enum(["STAFF", "MANAGER", "SUPER"]).optional(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
