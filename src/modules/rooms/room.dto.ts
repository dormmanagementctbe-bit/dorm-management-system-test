import { z } from "zod";

export const createRoomSchema = z.object({
  dormId: z.string().uuid(),
  roomNumber: z.string().min(1),
  capacity: z.coerce.number().int().min(1).max(10),
  roomType: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "QUAD"]),
  monthlyRate: z.coerce.number().min(0),
  status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "RESERVED"]).default("AVAILABLE"),
});

export const updateRoomSchema = createRoomSchema.partial().omit({ dormId: true });

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type UpdateRoomDto = z.infer<typeof updateRoomSchema>;
