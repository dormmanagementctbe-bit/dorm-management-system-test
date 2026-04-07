import { z } from "zod";

export const createRoomSchema = z.object({
  dormId: z.string().uuid(),
  floorNumber: z.coerce.number().int().min(0),
  roomNumber: z.string().min(1),
  capacity: z.coerce.number().int().min(1).max(10),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
});

export const updateRoomSchema = createRoomSchema.partial().omit({ dormId: true });

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
