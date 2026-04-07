import { z } from "zod";

export const createApplicationSchema = z.object({
  semesterId: z.string().uuid(),
  currentCity: z.string().max(120).optional(),
  preferredDormIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  reason: z.string().max(1000).optional(),
});

export const reviewApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "WAITLISTED"]),
  reviewNote: z.string().max(1000).optional(),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;
export type ReviewApplicationDto = z.infer<typeof reviewApplicationSchema>;
