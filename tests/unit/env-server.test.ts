import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SECRET_KEY: "secret-key",
};

const originalEnv = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadServerEnv() {
  vi.resetModules();
  return import("@/lib/env/server");
}

beforeEach(() => {
  // Aislar de lo que el shell de quien corre los tests tenga exportado —
  // sin esto, un WHATSAPP_PROVIDER real en el entorno filtraría entre tests.
  for (const key of [
    "WHATSAPP_PROVIDER",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_APPOINTMENT_CONTENT_SID",
    "APP_PUBLIC_URL",
    "CRON_SECRET",
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("serverEnv — WhatsApp/Twilio", () => {
  it("por default WHATSAPP_PROVIDER es 'mock' sin exigir credenciales de Twilio", async () => {
    setEnv({});
    const { serverEnv } = await loadServerEnv();
    expect(serverEnv.WHATSAPP_PROVIDER).toBe("mock");
  });

  it("con WHATSAPP_PROVIDER=twilio exige las cuatro variables o falla al arrancar", async () => {
    setEnv({ WHATSAPP_PROVIDER: "twilio" });
    await expect(loadServerEnv()).rejects.toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it("con las cuatro variables presentes, WHATSAPP_PROVIDER=twilio carga sin error", async () => {
    setEnv({
      WHATSAPP_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "ACxxxx",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_WHATSAPP_FROM: "+14155238886",
      APP_PUBLIC_URL: "https://kuni.example.com",
    });
    const { serverEnv } = await loadServerEnv();
    expect(serverEnv.WHATSAPP_PROVIDER).toBe("twilio");
    expect(serverEnv.TWILIO_ACCOUNT_SID).toBe("ACxxxx");
  });

  it("rechaza APP_PUBLIC_URL con '/' final (rompería la firma de Twilio)", async () => {
    setEnv({
      WHATSAPP_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "ACxxxx",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_WHATSAPP_FROM: "+14155238886",
      APP_PUBLIC_URL: "https://kuni.example.com/",
    });
    await expect(loadServerEnv()).rejects.toThrow(/APP_PUBLIC_URL/);
  });
});

describe("serverEnv — CRON_SECRET", () => {
  it("es opcional: sin definirla, no rompe el arranque", async () => {
    setEnv({});
    const { serverEnv } = await loadServerEnv();
    expect(serverEnv.CRON_SECRET).toBeUndefined();
  });

  it("rechaza un valor demasiado corto (protección débil no sirve como protección)", async () => {
    setEnv({ CRON_SECRET: "corto" });
    await expect(loadServerEnv()).rejects.toThrow(/CRON_SECRET/);
  });
});
