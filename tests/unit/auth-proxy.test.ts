import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ authenticated: false, networkError: false }));
vi.mock("@/lib/env/server", () => ({ serverEnv: {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key",
} }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: {
    setAll: (cookies: { name: string; value: string; options?: { path?: string; httpOnly?: boolean; maxAge?: number } }[]) => void;
  } }) => ({ auth: { getClaims: async () => {
    if (state.networkError) throw new Error("Network error");
    options.cookies.setAll([{ name: "sb-test-auth-token.0", value: "", options: { path: "/", maxAge: 0 } }]);
    options.cookies.setAll([{ name: "sb-test-auth-token.1", value: "renewed", options: { path: "/", httpOnly: true } }]);
    return { data: state.authenticated ? { claims: { sub: "user-a" } } : null, error: null };
  } } }),
}));

import { updateSession } from "@/lib/supabase/proxy";

beforeEach(() => { state.authenticated = false; state.networkError = false; });

describe("proxy de sesión SSR", () => {
  it("no acepta una cookie fixture como sesión y conserva cookies al redirigir", async () => {
    const request = new NextRequest("https://kuni.example/dashboard?prioridad=high", {
      headers: { cookie: "kuni_fixture_session=e39f8294-c9ef-45e4-adf4-79bfd5f50300" },
    });
    const response = await updateSession(request);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/dashboard?prioridad=high");
    expect(response.cookies.get("sb-test-auth-token.0")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-test-auth-token.1")?.value).toBe("renewed");
    expect(response.cookies.get("sb-test-auth-token.1")?.httpOnly).toBe(true);
  });

  it("deja login accesible para mostrar errores de membresía con JWT válido", async () => {
    state.authenticated = true;
    const response = await updateSession(new NextRequest("https://kuni.example/login?error=sin-membresia"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("deja al servidor autorizar membresía y conserva refresh en navegación válida", async () => {
    state.authenticated = true;
    const response = await updateSession(new NextRequest("https://kuni.example/consultorios"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-test-auth-token.1")?.value).toBe("renewed");
  });

  it("no produce una excepción de proxy en login si el proveedor no responde", async () => {
    state.networkError = true;
    const response = await updateSession(new NextRequest("https://kuni.example/login"));
    expect(response.headers.get("location")).toBeNull();
  });
});
