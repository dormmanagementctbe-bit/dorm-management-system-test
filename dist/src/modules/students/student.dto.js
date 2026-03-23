"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStudentSchema = void 0;
const zod_1 = require("zod");
exports.updateStudentSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).optional(),
    lastName: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().optional(),
    distanceKm: zod_1.z.coerce.number().min(0).optional(),
    costSharingEligible: zod_1.z.boolean().optional(),
    academicYear: zod_1.z.coerce.number().int().min(1).max(5).optional(),
    department: zod_1.z.string().optional(),
});
