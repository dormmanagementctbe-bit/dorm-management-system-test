import { z } from "zod";

// ==================== Dorm Management DTOs ====================

const dormBaseSchema = z.object({
  blockId: z.string().uuid({ message: "Invalid block ID format" }).optional(),
  buildingId: z.string().uuid({ message: "Invalid building ID format" }).optional(),
  code: z.string().min(1, "Dorm code is required").max(50, "Dorm code must be less than 50 characters").trim(),
  name: z.string().min(1, "Dorm name is required").max(100, "Dorm name must be less than 100 characters").trim(),
  floorNumber: z.coerce.number().int().min(0, "Floor number must be non-negative").max(20, "Floor number cannot exceed 20").default(0),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(20, "Capacity cannot exceed 20").default(1),
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

// ==================== Dorm Query DTOs ====================

export const listDormsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  genderRestriction: z.enum(["MALE_ONLY", "FEMALE_ONLY"]).optional(),
  blockId: z.string().uuid({ message: "Invalid block ID format" }).optional(),
  floorNumber: z.coerce.number().int().min(0, "Floor number must be non-negative").optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
});

// ==================== Dorm Rooms Query DTOs ====================

export const dormRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
  occupancy: z.enum(["all", "available", "occupied"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  floorNumber: z.coerce.number().int().min(0, "Floor number must be non-negative").optional(),
});

// ==================== Dorm Beds Query DTOs ====================

export const dormBedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").optional(),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "INACTIVE"])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

// ==================== Type Exports ====================

export type CreateDormDto = z.infer<typeof createDormSchema>;
export type UpdateDormDto = z.infer<typeof updateDormSchema>;
export type ListDormsQueryDto = z.infer<typeof listDormsQuerySchema>;
export type DormRoomsQueryDto = z.infer<typeof dormRoomsQuerySchema>;
export type DormBedsQueryDto = z.infer<typeof dormBedsQuerySchema>;
