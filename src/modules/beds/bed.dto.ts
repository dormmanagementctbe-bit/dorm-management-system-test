import { z } from "zod";

export const listBedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  dormId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "INACTIVE"])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type ListBedsQueryDto = z.infer<typeof listBedsQuerySchema>;
