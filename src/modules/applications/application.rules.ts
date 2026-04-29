export const requiredApplicationDocumentTypes = [
  "ID_IMAGE",
  "HIGHSCHOOL_TRANSCRIPT",
  "ENTRANCE_EXAM_RESULT",
  "KEBELE_VERIFICATION",
] as const;

export const optionalApplicationDocumentTypes = [
  "STAFF_RECOGNITION",
  "MEDICAL_DOCUMENT",
] as const;

export const supportedApplicationDocumentTypes = [
  ...requiredApplicationDocumentTypes,
  ...optionalApplicationDocumentTypes,
] as const;

export const medicalApplicationDocumentType = "MEDICAL_DOCUMENT" as const;

export type ApplicationDocumentTypeValue = (typeof supportedApplicationDocumentTypes)[number];

type ApplicationMedicalDetails = {
  hasMedicalCondition?: boolean;
  medicalConditionTags?: string[];
  medicalCondition?: string | null;
};

function normalizeMedicalCondition(medicalCondition?: string | null) {
  return medicalCondition?.trim() ?? "";
}

export function hasMedicalSupportDisclosure(details: ApplicationMedicalDetails) {
  return Boolean(
    details.hasMedicalCondition ||
      (details.medicalConditionTags?.length ?? 0) > 0 ||
      normalizeMedicalCondition(details.medicalCondition).length > 0
  );
}

export function getRequiredApplicationDocumentTypes(details: ApplicationMedicalDetails = {}) {
  if (!hasMedicalSupportDisclosure(details)) {
    return [...requiredApplicationDocumentTypes];
  }

  return [...requiredApplicationDocumentTypes, medicalApplicationDocumentType];
}

export function findMissingRequiredApplicationDocumentTypes(
  documents: Array<{ type: ApplicationDocumentTypeValue }>,
  details: ApplicationMedicalDetails = {}
) {
  const providedTypes = new Set(documents.map((document) => document.type));

  return getRequiredApplicationDocumentTypes(details).filter((type) => !providedTypes.has(type));
}
