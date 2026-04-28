import { z } from "zod";

// ==================== Bed Query DTOs ====================

export const listBedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").optional(),
  dormId: z.string().uuid({ message: "Invalid dorm ID format" }).optional(),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "INACTIVE"])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type ListBedsQueryDto = z.infer<typeof listBedsQuerySchema>;
