import { z } from "zod";

const dormBaseSchema = z.object({
  blockId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  floorNumber: z.coerce.number().int().min(0).default(0),
  capacity: z.coerce.number().int().min(1).default(1),
  genderRestriction: z.enum(["MALE_ONLY", "FEMALE_ONLY"]),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
});

export const createDormSchema = dormBaseSchema
  .refine((value) => Boolean(value.blockId || value.buildingId), {
    message: "Provide either blockId or buildingId",
    path: ["blockId"],
  })
  .transform(({ buildingId, blockId, ...rest }) => ({
    ...rest,
    blockId: blockId ?? buildingId!,
  }));

export const updateDormSchema = dormBaseSchema.partial().transform(({ buildingId, blockId, ...rest }) => ({
  ...rest,
  ...(blockId || buildingId ? { blockId: blockId ?? buildingId } : {}),
}));

export type CreateDormDto = z.infer<typeof createDormSchema>;
export type UpdateDormDto = z.infer<typeof updateDormSchema>;
