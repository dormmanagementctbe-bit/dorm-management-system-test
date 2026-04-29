import { describe, expect, it } from "vitest";
import {
  findMissingRequiredApplicationDocumentTypes,
  hasMedicalSupportDisclosure,
} from "../src/modules/applications/application.rules";

const baseDocuments = [
  { type: "ID_IMAGE" as const },
  { type: "HIGHSCHOOL_TRANSCRIPT" as const },
  { type: "ENTRANCE_EXAM_RESULT" as const },
  { type: "KEBELE_VERIFICATION" as const },
];

describe("application document rules", () => {
  it("does not require a medical document when no medical support is disclosed", () => {
    expect(
      findMissingRequiredApplicationDocumentTypes(baseDocuments, {
        hasMedicalCondition: false,
        medicalConditionTags: [],
        medicalCondition: null,
      })
    ).toEqual([]);
  });

  it("requires a medical document when medical support is disclosed", () => {
    expect(
      findMissingRequiredApplicationDocumentTypes(baseDocuments, {
        hasMedicalCondition: true,
        medicalConditionTags: ["ASTHMA"],
        medicalCondition: "Needs nearby washroom access",
      })
    ).toEqual(["MEDICAL_DOCUMENT"]);
  });

  it("treats tags or notes as a medical disclosure even without the boolean flag", () => {
    expect(
      hasMedicalSupportDisclosure({
        medicalConditionTags: ["ALLERGY"],
        medicalCondition: "Carries an EpiPen",
      })
    ).toBe(true);
  });
});
