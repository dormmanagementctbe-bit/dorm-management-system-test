import { z } from "zod";

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  fatherName: z.string().optional(),
  grandfatherName: z.string().min(1).optional(),
  studyYear: z.enum(["I", "II", "III", "IV", "V"]).optional(),
  phone: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  hasDisability: z.boolean().optional(),
  disabilityNotes: z.string().optional(),
  scholarshipNotes: z.string().optional(),
  department: z.string().optional(),
});

export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;
