import { z } from "zod";

export const createDormSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  genderPolicy: z.enum(["MALE", "FEMALE", "MIXED"]).default("MIXED"),
  totalRooms: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateDormSchema = createDormSchema.partial();

export type CreateDormDto = z.infer<typeof createDormSchema>;
export type UpdateDormDto = z.infer<typeof updateDormSchema>;
