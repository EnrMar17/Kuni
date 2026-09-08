import { describe, expect, it } from "vitest";

import { phoneLookupCandidates, stripWhatsAppPrefix } from "@/lib/whatsapp/phone";

describe("stripWhatsAppPrefix", () => {
  it("quita el prefijo 'whatsapp:' del From/To de Twilio", () => {
    expect(stripWhatsAppPrefix("whatsapp:+5214431234567")).toBe("+5214431234567");
  });

  it("deja intacto un E.164 que ya viene sin prefijo", () => {
    expect(stripWhatsAppPrefix("+524431234567")).toBe("+524431234567");
  });
});

describe("phoneLookupCandidates — variantes de México", () => {
  it("desde `+521XXXXXXXXXX` (lo que manda WhatsApp) también busca sin el 1", () => {
    expect(phoneLookupCandidates("whatsapp:+5214431234567")).toEqual(["+5214431234567", "+524431234567"]);
  });

  it("desde `+52XXXXXXXXXX` (E.164 capturado) también busca con el 1", () => {
    expect(phoneLookupCandidates("+524431234567")).toEqual(["+524431234567", "+5214431234567"]);
  });

  it("el número tal como llegó siempre va primero", () => {
    expect(phoneLookupCandidates("+5214431234567")[0]).toBe("+5214431234567");
  });
});

describe("phoneLookupCandidates — fuera de México", () => {
  it("no inventa variantes de otras numeraciones: agregar un dígito cambiaría de persona", () => {
    expect(phoneLookupCandidates("whatsapp:+14155238886")).toEqual(["+14155238886"]);
    expect(phoneLookupCandidates("+5215512345678901")).toEqual(["+5215512345678901"]);
  });

  it("un +52 con longitud distinta a la nacional no genera variante", () => {
    expect(phoneLookupCandidates("+52443123456")).toEqual(["+52443123456"]);
  });
});
