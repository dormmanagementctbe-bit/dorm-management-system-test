"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoomSchema = exports.createRoomSchema = void 0;
const zod_1 = require("zod");
exports.createRoomSchema = zod_1.z.object({
    dormId: zod_1.z.string().uuid(),
    roomNumber: zod_1.z.string().min(1),
    capacity: zod_1.z.coerce.number().int().min(1).max(10),
    roomType: zod_1.z.enum(["SINGLE", "DOUBLE", "TRIPLE", "QUAD"]),
    monthlyRate: zod_1.z.coerce.number().min(0),
    status: zod_1.z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "RESERVED"]).default("AVAILABLE"),
});
exports.updateRoomSchema = exports.createRoomSchema.partial().omit({ dormId: true });
