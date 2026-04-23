import { z } from "zod";

const roomBaseSchema = z.object({
  dormId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
  floorNumber: z.coerce.number().int().min(0),
  roomNumber: z.string().min(1),
  capacity: z.coerce.number().int().min(1).max(10),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
});

export const createRoomSchema = roomBaseSchema.refine((value) => Boolean(value.dormId || value.blockId), {
  message: "Provide either dormId or blockId",
  path: ["blockId"],
});

export const updateRoomSchema = roomBaseSchema.partial().omit({ dormId: true, blockId: true });

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
