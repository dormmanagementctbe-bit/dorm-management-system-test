import { z } from "zod";

export const addisAbabaSubcities = [
  "ARADA",
  "BOLE",
  "GULLELE",
  "KIRKOS",
  "KOLFE_KERANIO",
  "LIDETA",
  "NIFAS_SILK_LAFTO",
  "YEKA",
  "AKAKI_KALITI",
  "ADDIS_KETEMA",
  "LEMI_KURA",
] as const;

const applicationDocumentTypeSchema = z.enum([
  "ID_IMAGE",
  "HIGHSCHOOL_TRANSCRIPT",
  "ENTRANCE_EXAM_RESULT",
  "KEBELE_VERIFICATION",
  "STAFF_RECOGNITION",
  "MEDICAL_DOCUMENT",
]);

const uploadMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
const academicYearPattern = /^\d{4}\/\d{2}$/;

function optionalTrimmedString(max: number) {
  return z.string().trim().min(1).max(max).optional();
}

function nullableTrimmedString(max: number) {
  return z.string().trim().min(1).max(max).nullable().optional();
}

function ensureRequiredDocumentTypes(
  documents: Array<z.infer<typeof applicationDocumentSchema>>,
  ctx: z.RefinementCtx
) {
  const requiredDocumentTypes = [
    "ID_IMAGE",
    "HIGHSCHOOL_TRANSCRIPT",
    "ENTRANCE_EXAM_RESULT",
    "KEBELE_VERIFICATION",
  ] as const;

  const providedTypes = new Set(documents.map((document) => document.type));
  for (const type of requiredDocumentTypes) {
    if (!providedTypes.has(type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing required document type: ${type}`,
        path: ["documents"],
      });
    }
  }
}

export const applicationDocumentSchema = z.object({
  type: applicationDocumentTypeSchema,
  originalName: z.string().trim().min(1),
  storagePath: z.string().trim().min(1),
  mimeType: z.enum(uploadMimeTypes),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export const applicationLocationSchema = z.object({
  currentSubcity: z.enum(addisAbabaSubcities),
  currentWoreda: nullableTrimmedString(120),
});

export const createApplicationSchema = z.object({
  studentFullName: z.string().trim().min(1).max(160),
  studentNumber: z.string().trim().min(1).max(50),
  academicYear: z.string().trim().regex(academicYearPattern, "academicYear must be in the format YYYY/YY"),
  department: nullableTrimmedString(120),
  guardianName: nullableTrimmedString(120),
  guardianPhone: nullableTrimmedString(30),
  location: applicationLocationSchema,
  medicalCondition: nullableTrimmedString(500),
  documents: z.array(applicationDocumentSchema).min(4),
}).superRefine((value, ctx) => {
  ensureRequiredDocumentTypes(value.documents, ctx);
});

export const updateApplicationSchema = z.object({
  studentFullName: z.string().trim().min(1).max(160).optional(),
  studentNumber: z.string().trim().min(1).max(50).optional(),
  academicYear: z
    .string()
    .trim()
    .regex(academicYearPattern, "academicYear must be in the format YYYY/YY")
    .optional(),
  department: nullableTrimmedString(120),
  guardianName: nullableTrimmedString(120),
  guardianPhone: nullableTrimmedString(30),
  location: applicationLocationSchema.partial().optional(),
  medicalCondition: nullableTrimmedString(500),
  documents: z.array(applicationDocumentSchema).min(4).optional(),
}).superRefine((value, ctx) => {
  if (value.documents) {
    ensureRequiredDocumentTypes(value.documents, ctx);
  }
});

export const setEditOverrideSchema = z.object({
  editOverrideUntil: z.coerce.date(),
});

export const reviewApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "WAITLISTED"]),
  reviewNote: optionalTrimmedString(1000),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
export type SetEditOverrideDto = z.infer<typeof setEditOverrideSchema>;
export type ReviewApplicationDto = z.infer<typeof reviewApplicationSchema>;
