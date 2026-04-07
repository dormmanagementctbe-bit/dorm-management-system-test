import { z } from "zod";

export const createAllocationSchema = z.object({
  studentId: z.string().uuid(),
  bedId: z.string().uuid(),
  applicationId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semesterId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()),
});

export const updateAllocationStatusSchema = z.object({
  status: z.enum(["PENDING_CHECKIN", "ACTIVE", "EXPIRED", "CANCELLED"]),
});

export type CreateAllocationDto = z.infer<typeof createAllocationSchema>;
export type UpdateAllocationStatusDto = z.infer<typeof updateAllocationStatusSchema>;
