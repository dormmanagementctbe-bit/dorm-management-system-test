"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDormSchema = exports.createDormSchema = void 0;
const zod_1 = require("zod");
exports.createDormSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    location: zod_1.z.string().min(1),
    genderPolicy: zod_1.z.enum(["MALE", "FEMALE", "MIXED"]).default("MIXED"),
    totalRooms: zod_1.z.coerce.number().int().min(0).default(0),
    isActive: zod_1.z.boolean().default(true),
});
exports.updateDormSchema = exports.createDormSchema.partial();
