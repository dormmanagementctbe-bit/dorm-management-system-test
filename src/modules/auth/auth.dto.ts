import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["STUDENT", "ADMIN"]).default("STUDENT"),
  // Student-specific fields
  studentId: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  academicYear: z.coerce.number().int().min(1).max(5).optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  distanceKm: z.coerce.number().min(0).optional(),
  costSharingEligible: z.boolean().optional(),
  // Admin-specific fields
  adminLevel: z.enum(["STAFF", "MANAGER", "SUPER"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
