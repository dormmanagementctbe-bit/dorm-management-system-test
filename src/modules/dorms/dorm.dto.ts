import { z } from "zod";

export const createDormSchema = z.object({
  buildingId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  genderRestriction: z.enum(["MALE_ONLY", "FEMALE_ONLY"]),
  isActive: z.boolean().default(true),
});

export const updateDormSchema = createDormSchema.partial();

export type CreateDormDto = z.infer<typeof createDormSchema>;
export type UpdateDormDto = z.infer<typeof updateDormSchema>;
