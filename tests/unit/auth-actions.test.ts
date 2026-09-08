import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getAuthContext: vi.fn(), findActiveConsultingRoom: vi.fn(),
  setConsultingRoomCookie: vi.fn(), clearConsultingRoomCookie: vi.fn(),
  deleteCookie: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: mocks.deleteCookie }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: mocks.getAuthContext,
  findActiveConsultingRoom: mocks.findActiveConsultingRoom,
  setConsultingRoomCookie: mocks.setConsultingRoomCookie,
  clearConsultingRoomCookie: mocks.clearConsultingRoomCookie,
}));

import { login, logout, selectConsultingRoom } from "@/actions/auth";
import { AppError } from "@/contracts/errors";

const roomId = "5b506282-a9d3-4b3f-87ec-ad91b24ead87";

function loginForm(redirectTo = "/dashboard") {
  const form = new FormData();
  form.set("email", " CLINICIAN@EXAMPLE.INVALID ");
  form.set("password", "test-password-not-a-real-account");
  form.set("redirectTo", redirectTo);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getAuthContext.mockResolvedValue({ userId: "user-a", unitId: "unit-a", role: "clinician" });
  mocks.findActiveConsultingRoom.mockResolvedValue({ id: roomId });
});

describe("acciones de autenticación y selección", () => {
  it("autentica con Supabase, valida membresía y descarta destinos externos", async () => {
    await expect(login({ error: null }, loginForm("https://example.com")))
      .rejects.toThrow("REDIRECT:/consultorios?redirectTo=%2Fdashboard");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "clinician@example.invalid", password: "test-password-not-a-real-account" });
    expect(mocks.getAuthContext).toHaveBeenCalledOnce();
    expect(mocks.clearConsultingRoomCookie).toHaveBeenCalledOnce();
    expect(mocks.deleteCookie).toHaveBeenCalledWith("kuni_fixture_session");
  });

  it("no entra al área clínica si el proveedor rechaza credenciales", async () => {
    mocks.signIn.mockResolvedValue({ error: { status: 400, message: "internal provider detail" } });
    expect(await login({ error: null }, loginForm())).toEqual({ error: "El correo o la contraseña no son correctos." });
    expect(mocks.getAuthContext).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("distingue el límite de intentos (429) de una credencial incorrecta", async () => {
    mocks.signIn.mockResolvedValue({ error: { status: 429, message: "rate limited" } });
    expect(await login({ error: null }, loginForm())).toEqual({
      error: "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
    });
    expect(mocks.getAuthContext).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("muestra falta de membresía sin volver a redirigir al área protegida", async () => {
    mocks.getAuthContext.mockRejectedValue(new AppError("FORBIDDEN", "Unidad no habilitada."));
    expect(await login({ error: null }, loginForm())).toEqual({ error: "Unidad no habilitada." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("no guarda una cookie para un consultorio ajeno o inactivo", async () => {
    mocks.findActiveConsultingRoom.mockResolvedValue(null);
    const form = new FormData();
    form.set("roomId", roomId);
    await expect(selectConsultingRoom(form)).rejects.toThrow("REDIRECT:/consultorios?error=consultorio-invalido");
    expect(mocks.findActiveConsultingRoom).toHaveBeenCalledWith(expect.objectContaining({ unitId: "unit-a" }), roomId);
    expect(mocks.setConsultingRoomCookie).not.toHaveBeenCalled();
  });

  it("permite a viewer elegir un contexto autorizado de lectura", async () => {
    mocks.getAuthContext.mockResolvedValue({ userId: "viewer", unitId: "unit-a", role: "viewer" });
    const form = new FormData();
    form.set("roomId", roomId);
    form.set("redirectTo", "/pacientes?prioridad=high");
    await expect(selectConsultingRoom(form)).rejects.toThrow("REDIRECT:/pacientes?prioridad=high");
    expect(mocks.setConsultingRoomCookie).toHaveBeenCalledWith(roomId);
  });

  it("una acción sin sesión vuelve a login sin escribir preferencias", async () => {
    mocks.getAuthContext.mockRejectedValue(new AppError("UNAUTHENTICATED", "Sesión vencida."));
    const form = new FormData();
    form.set("roomId", roomId);
    await expect(selectConsultingRoom(form)).rejects.toThrow("REDIRECT:/login?error=sesion-vencida");
    expect(mocks.setConsultingRoomCookie).not.toHaveBeenCalled();
  });

  it("cierra la sesión local de Supabase y elimina las preferencias", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clearConsultingRoomCookie).toHaveBeenCalledOnce();
    expect(mocks.deleteCookie).toHaveBeenCalledWith("kuni_selected_room");
  });

  it("informa el fallo de signOut sin afirmar que cerró la sesión", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("network") });
    await expect(logout()).rejects.toThrow("REDIRECT:/login?error=salida-fallida");
  });
});
