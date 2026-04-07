import { z } from "zod";

export const createMaintenanceSchema = z.object({
  roomId: z.string().uuid(),
  category: z.enum(["PLUMBING", "ELECTRICAL", "FURNITURE", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
});

export const updateMaintenanceSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
});

export type CreateMaintenanceDto = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceDto = z.infer<typeof updateMaintenanceSchema>;
