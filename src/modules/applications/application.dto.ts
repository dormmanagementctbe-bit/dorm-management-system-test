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

export const applicationDocumentSchema = z.object({
  type: applicationDocumentTypeSchema,
  originalName: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.enum(uploadMimeTypes),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export const createApplicationSchema = z.object({
  semesterId: z.string().uuid(),
  currentCity: z.string().max(120).default("Addis Ababa"),
  currentSubcity: z.enum(addisAbabaSubcities),
  currentWoreda: z.string().max(120).optional(),
  hasDisability: z.boolean().default(false),
  disabilityType: z.string().max(120).optional(),
  medicalConditions: z.array(z.string().min(1).max(120)).max(10).default([]),
  documents: z.array(applicationDocumentSchema).min(4),
  preferredDormIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  reason: z.string().max(1000).optional(),
}).superRefine((value, ctx) => {
  const requiredDocumentTypes = [
    "ID_IMAGE",
    "HIGHSCHOOL_TRANSCRIPT",
    "ENTRANCE_EXAM_RESULT",
    "KEBELE_VERIFICATION",
  ] as const;

  const providedTypes = new Set(value.documents.map((document) => document.type));
  for (const type of requiredDocumentTypes) {
    if (!providedTypes.has(type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing required document type: ${type}`,
        path: ["documents"],
      });
    }
  }

  if (value.hasDisability && !value.disabilityType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "disabilityType is required when hasDisability is true",
      path: ["disabilityType"],
    });
  }
});

export const updateApplicationSchema = z.object({
  currentSubcity: z.enum(addisAbabaSubcities).optional(),
  currentWoreda: z.string().max(120).optional(),
  hasDisability: z.boolean().optional(),
  disabilityType: z.string().max(120).nullable().optional(),
  medicalConditions: z.array(z.string().min(1).max(120)).max(10).optional(),
  reason: z.string().max(1000).optional(),
  preferredDormIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  documents: z.array(applicationDocumentSchema).optional(),
});

export const setEditOverrideSchema = z.object({
  editOverrideUntil: z.coerce.date(),
});

export const reviewApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "WAITLISTED"]),
  reviewNote: z.string().max(1000).optional(),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
export type SetEditOverrideDto = z.infer<typeof setEditOverrideSchema>;
export type ReviewApplicationDto = z.infer<typeof reviewApplicationSchema>;
