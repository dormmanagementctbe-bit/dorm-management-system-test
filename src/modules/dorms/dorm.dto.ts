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

export const listDormsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export const dormRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
  occupancy: z.enum(["all", "available", "occupied"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export const dormBedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "INACTIVE"])
    .optional(),
  roomId: z.string().uuid().optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type CreateDormDto = z.infer<typeof createDormSchema>;
export type UpdateDormDto = z.infer<typeof updateDormSchema>;
export type ListDormsQueryDto = z.infer<typeof listDormsQuerySchema>;
export type DormRoomsQueryDto = z.infer<typeof dormRoomsQuerySchema>;
export type DormBedsQueryDto = z.infer<typeof dormBedsQuerySchema>;
