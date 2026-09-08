import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/context", () => ({ requireClinicalWriteContext: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { medicationTherapeuticClassInputSchema, resolveAlertRpcInputSchema } from "@/contracts/clinical-actions";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";

describe("adaptador de resolve_alert", () => {
  it("conserva el token de concurrencia como texto y acepta solo estados de atención", () => {
    const result = resolveAlertRpcInputSchema.safeParse({
      patientId: "11111111-1111-4111-8111-111111111111",
      alertId: "22222222-2222-4222-8222-222222222222",
      expectedUpdatedAt: "2026-09-08T12:00:00.123456+00:00",
      status: "resolved",
      note: "Se revisó con el paciente.",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.expectedUpdatedAt).toContain("123456");
  });

  it("mapea los códigos PT publicados al contrato de la aplicación", () => {
    expect(
      mapClinicalRpcFailure({ code: "PT409", message: "CONFLICT" }).code,
    ).toBe("CONFLICT");
    expect(
      mapClinicalRpcFailure({ code: "PT422", message: "VALIDATION" }).code,
    ).toBe("VALIDATION");
  });

  it("acepta solo clases terapéuticas aprobadas para una receta del paciente", () => {
    const valid = medicationTherapeuticClassInputSchema.safeParse({
      patientId: "11111111-1111-4111-8111-111111111111",
      prescriptionId: "22222222-2222-4222-8222-222222222222",
      medicationId: "33333333-3333-4333-8333-333333333333",
      therapeuticClass: "antidiabetic",
    });
    expect(valid.success).toBe(true);

    expect(medicationTherapeuticClassInputSchema.safeParse({
      patientId: "11111111-1111-4111-8111-111111111111",
      prescriptionId: "22222222-2222-4222-8222-222222222222",
      medicationId: "33333333-3333-4333-8333-333333333333",
      therapeuticClass: "diuretic",
    }).success).toBe(false);
  });
});
