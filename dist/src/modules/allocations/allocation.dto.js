"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAllocationStatusSchema = exports.createAllocationSchema = void 0;
const zod_1 = require("zod");
exports.createAllocationSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    roomId: zod_1.z.string().uuid(),
    applicationId: zod_1.z.string().uuid(),
    academicYearId: zod_1.z.string().uuid(),
    startDate: zod_1.z.string().datetime({ offset: true }).or(zod_1.z.string().date()),
    endDate: zod_1.z.string().datetime({ offset: true }).or(zod_1.z.string().date()),
});
exports.updateAllocationStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["PENDING_CHECKIN", "ACTIVE", "EXPIRED", "CANCELLED"]),
});
