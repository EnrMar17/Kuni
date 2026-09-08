import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getAuthContext, getPageAuthContext, requireClinicalWriteContext } from "@/lib/auth/context";

const roomId = "5b506282-a9d3-4b3f-87ec-ad91b24ead87";
const unitId = "e39f8294-c9ef-45e4-adf4-79bfd5f50300";

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function setup({ role = "clinician", room = true, membership = true, claims = true } = {}) {
  const membershipQuery = queryResult(membership ? {
    unit_id: unitId,
    active: true,
    role,
    health_units: { id: unitId, name: "Unidad A", institutional_code: "A", timezone: "America/Mexico_City", active: true },
  } : null);
  const roomQuery = queryResult(room ? {
    id: roomId,
    name: "Consultorio A",
    doctor_id: "doctor-a",
    doctors: { full_name: "Médico A", professional_license: null, active: true },
  } : null);
  const client = {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: claims ? { claims: { sub: "user-a" } } : null, error: null }) },
    from: vi.fn((table: string) => table === "unit_memberships" ? membershipQuery : roomQuery),
  };
  mocks.createClient.mockResolvedValue(client);
  mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: roomId })) });
  return { client, membershipQuery, roomQuery };
}

beforeEach(() => vi.clearAllMocks());

describe("autorización SSR", () => {
  it("ignora una cookie de consultorio si no hay JWT válido", async () => {
    const { client } = setup({ claims: false });
    await expect(getAuthContext()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rechaza una sesión Auth sin membresía de unidad activa", async () => {
    setup({ membership: false });
    await expect(getAuthContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("consulta el UUID de la cookie solo dentro de la unidad del JWT", async () => {
    const { membershipQuery, roomQuery } = setup({ room: false });
    const context = await getAuthContext();
    expect(context.unitId).toBe(unitId);
    expect(context.consultingRoom).toBeNull();
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(roomQuery.eq).toHaveBeenCalledWith("unit_id", unitId);
    expect(roomQuery.eq).toHaveBeenCalledWith("id", roomId);
    expect(roomQuery.eq).toHaveBeenCalledWith("doctors.active", true);
  });

  it("descarta una cookie que no contiene UUID sin consultar consultorios", async () => {
    const { client } = setup();
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "invalid-room" })) });
    expect((await getAuthContext()).consultingRoom).toBeNull();
    expect(client.from).not.toHaveBeenCalledWith("consulting_rooms");
  });

  it("permite lectura de viewer y rechaza sus mutaciones clínicas", async () => {
    setup({ role: "viewer" });
    expect((await getAuthContext()).consultingRoom?.doctorName).toBe("Médico A");
    await expect(requireClinicalWriteContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no habilita un consultorio cuyo médico está inactivo", async () => {
    const { roomQuery } = setup();
    roomQuery.maybeSingle.mockResolvedValue({ data: { id: roomId, doctors: { active: false } }, error: null });
    expect((await getAuthContext()).consultingRoom).toBeNull();
  });

  it("envía al login el error de membresía para que pueda mostrarse", async () => {
    setup({ membership: false });
    await expect(getPageAuthContext()).rejects.toThrow("REDIRECT:/login?error=sin-membresia");
  });
});
