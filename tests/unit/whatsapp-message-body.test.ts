import { describe, expect, it } from "vitest";
import { renderReminderBody } from "@/lib/whatsapp/message-body";

describe("renderReminderBody", () => {
  it("medicamento: incluye nombre + dosis y el formato SI/NO con el código", () => {
    const body = renderReminderBody({
      kind: "medication",
      replyCode: "A7F3",
      doseText: "1 tableta cada 12 horas",
      medicationName: "Metformina 850mg",
    });
    expect(body).toContain("Metformina 850mg — 1 tableta cada 12 horas");
    expect(body).toContain("SI A7F3");
    expect(body).toContain("NO A7F3");
  });

  it("medicamento sin nombre de medicamento (dato ausente) usa solo la dosis, no inventa un nombre", () => {
    const body = renderReminderBody({ kind: "medication", replyCode: "A7F3", doseText: "1 tableta", medicationName: null });
    expect(body).toContain("1 tableta");
    expect(body).not.toContain("null");
    expect(body).not.toContain("undefined");
  });

  it("glucosa: usa el formato exacto GLUCOSA <código> <valor> del parser", () => {
    const body = renderReminderBody({ kind: "measurement", replyCode: "B9K2", variable: "glucose" });
    expect(body).toContain("GLUCOSA B9K2");
  });

  it("presión: usa el formato exacto PRESION <código> <sistólica>/<diastólica> del parser", () => {
    const body = renderReminderBody({ kind: "measurement", replyCode: "C6M4", variable: "blood_pressure" });
    expect(body).toContain("PRESION C6M4");
  });
});
