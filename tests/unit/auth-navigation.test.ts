import { describe, expect, it } from "vitest";
import { postLoginRedirect } from "@/lib/auth/navigation";

describe("destinos después de autenticar", () => {
  it.each([
    "https://example.com", "//example.com", "/\\example.com", "/a\\b", "/a\nLocation:evil",
    "/login", "/login?redirectTo=/login", "/pacientes/../login", "/api/jobs/tick", "/", null,
  ])("rechaza destinos externos, autenticación o endpoints: %s", (candidate) => {
    expect(postLoginRedirect(candidate)).toBe("/dashboard");
  });

  it("conserva una ruta clínica local con sus filtros", () => {
    expect(postLoginRedirect("/pacientes?prioridad=high#historial"))
      .toBe("/pacientes?prioridad=high#historial");
  });
});
