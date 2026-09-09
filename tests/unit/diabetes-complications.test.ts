import { describe, expect, it } from "vitest";

import {
  DIABETES_COMPLICATIONS,
  DIABETES_COMPLICATION_BY_CODE,
  isDiabetesComplicationCode,
  isDocumentedDiabetesComplication,
} from "@/lib/clinical/diabetes-complications";

describe("catálogo de complicaciones de diabetes", () => {
  it("explica una sola vez todos los códigos E110-E119", () => {
    expect(DIABETES_COMPLICATIONS.map(({ code }) => code)).toEqual([
      "E110",
      "E111",
      "E112",
      "E113",
      "E114",
      "E115",
      "E116",
      "E117",
      "E118",
      "E119",
    ]);
    expect(
      DIABETES_COMPLICATIONS.every(
        ({ label, description }) => label.length > 0 && description.length > 0,
      ),
    ).toBe(true);
  });

  it("distingue E119 de una complicación clínica", () => {
    expect(DIABETES_COMPLICATION_BY_CODE.E119.modelSeverity).toBe("none");
    expect(isDocumentedDiabetesComplication("E119")).toBe(false);
    expect(isDocumentedDiabetesComplication("E112")).toBe(true);
  });

  it("rechaza códigos fuera del catálogo", () => {
    expect(isDiabetesComplicationCode("E113")).toBe(true);
    expect(isDiabetesComplicationCode("E999")).toBe(false);
  });
});
