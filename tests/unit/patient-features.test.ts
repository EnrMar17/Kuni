import { describe, expect, it } from "vitest";
import { computeAdherence } from "../../domain-core/src/lib/domain/adherence";
import { buildPatientMlFeatureInput } from "../../src/lib/ml/patient-features";
import { patient } from "../support/dashboard";

describe("buildPatientMlFeatureInput", () => {
  it("forwards the per-class AdherenceResult as-is, without collapsing 'no data' into a fabricated value", () => {
    const p = { ...patient("patient-a", "Paciente de prueba"), age: 60, diagnosisCodes: ["diabetes_type_2"] };
    const input = buildPatientMlFeatureInput(p);
    expect(input.antidiabeticAdherence).toMatchObject({ hasData: false, confirmedAdherencePct: null });
    expect(input.antihypertensiveAdherence).toMatchObject({ hasData: false, confirmedAdherencePct: null });
  });

  it("forwards a real confirmed-adherence cohort computed upstream by dashboard.ts", () => {
    const base = patient("patient-a", "Paciente de prueba");
    const p = {
      ...base,
      age: 60,
      diagnosisCodes: ["diabetes_type_2"],
      therapeuticAdherence: {
        antidiabetic: computeAdherence({ concluded: [{ outcome: "yes" }, { outcome: "yes" }, { outcome: "no" }] }),
        antihypertensive: computeAdherence({ concluded: [] }),
      },
    };
    const input = buildPatientMlFeatureInput(p);
    expect(input.antidiabeticAdherence).toMatchObject({ y: 2, n: 1, confirmedAdherencePct: 66.7 });
    expect(input.antihypertensiveAdherence).toMatchObject({ hasData: false, confirmedAdherencePct: null });
  });
});
