import { z } from "zod";

const roleCodeSchema = z.enum([
  "STUDENT",
  "DORM_HEAD",
  "ADMIN",
  "SUPER_ADMIN",
  "MAINTENANCE",
]);

const studentProfileSchema = z.object({
  studentNumber: z.string().min(1),
  firstName: z.string().min(1),
  fatherName: z.string().optional(),
  grandfatherName: z.string().min(1),
  gender: z.enum(["MALE", "FEMALE"]),
  studyYear: z.enum(["I", "II", "III", "IV", "V"]),
  department: z.string().optional(),
  phone: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  hasDisability: z.boolean().optional(),
  disabilityNotes: z.string().optional(),
  scholarshipNotes: z.string().optional(),
});

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().optional(),
    includeInactive: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();

export const updateMeSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    fatherName: z.string().optional(),
    grandfatherName: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    department: z.string().optional(),
    currentPassword: z.string().min(8).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: "currentPassword is required when newPassword is provided",
      path: ["currentPassword"],
    }
  );

export const createUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    roleCodes: z.array(roleCodeSchema).min(1),
    studentProfile: studentProfileSchema.optional(),
  })
  .strict();

export const updateUserByIdSchema = z
  .object({
    email: z.string().email().optional(),
    roleCodes: z.array(roleCodeSchema).min(1).optional(),
    studentProfile: studentProfileSchema.partial().optional(),
    passwordHash: z.never().optional(),
    password: z.never().optional(),
  })
  .strict();

export type ListUsersQueryDto = z.infer<typeof listUsersQuerySchema>;
export type UpdateMeDto = z.infer<typeof updateMeSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserByIdDto = z.infer<typeof updateUserByIdSchema>;
