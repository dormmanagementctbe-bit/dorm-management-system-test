import { z } from "zod";

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  distanceKm: z.coerce.number().min(0).optional(),
  costSharingEligible: z.boolean().optional(),
  academicYear: z.coerce.number().int().min(1).max(5).optional(),
  department: z.string().optional(),
});

export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;
