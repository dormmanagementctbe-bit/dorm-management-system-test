"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewApplicationSchema = exports.createApplicationSchema = void 0;
const zod_1 = require("zod");
exports.createApplicationSchema = zod_1.z.object({
    preferredDormId: zod_1.z.string().uuid().optional(),
    reason: zod_1.z.string().max(1000).optional(),
});
exports.reviewApplicationSchema = zod_1.z.object({
    status: zod_1.z.enum(["APPROVED", "REJECTED", "WAITLISTED"]),
    reviewNote: zod_1.z.string().max(1000).optional(),
});
