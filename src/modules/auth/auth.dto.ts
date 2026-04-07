import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  studentNumber: z.string().min(1, "studentNumber is required"),
  firstName: z.string().min(1, "firstName is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "lastName is required"),
  gender: z.enum(["MALE", "FEMALE"]),
  studyYear: z.coerce.number().int().min(1).max(8),
  department: z.string().optional(),
  phone: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  hasDisability: z.boolean().optional(),
  disabilityNotes: z.string().optional(),
  scholarshipNotes: z.string().optional(),
}).strict();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
