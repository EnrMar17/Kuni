import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { ScheduleAppointmentInput } from "@/contracts/appointments";

const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireClinicalWriteContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { scheduleAppointment } from "@/actions/appointments";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const updatedAt = "2026-09-08T12:00:00.123456+00:00";
const startsAt = "2026-09-15T18:00:00.000000+00:00";
const value = (): ScheduleAppointmentInput => ({ patientId: id(1), startsAt, urgency: "routine", reason: "Revision de tratamiento" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ unitId: id(2), consultingRoom: { id: id(3), doctorId: id(4) } });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { data: { appointment: { id: id(5), startsAt, updatedAt } }, error: null }, error: null });
});

describe("schedule appointment action", () => {
  it("uses server attribution and invalidates only after a confirmed result", async () => {
    expect(await scheduleAppointment(value())).toEqual({ data: { id: id(5), startsAt, updatedAt }, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith("schedule_appointment", {
      p_patient_id: id(1), p_room_id: id(3), p_doctor_id: id(4),
      p_starts_at: startsAt, p_urgency: "routine", p_reason: "Revision de tratamiento",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/citas");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });
  it.each(["PT401", "PT403", "PT409", "PT422"])("maps %s without invalidation", async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "Rejected" } });
    expect((await scheduleAppointment(value())).error?.code).toBe(
      ({ PT401: "UNAUTHENTICATED", PT403: "FORBIDDEN", PT409: "CONFLICT", PT422: "VALIDATION" })[code],
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not touch the database for denied auth", async () => {
    mocks.context.mockRejectedValue(new AppError("FORBIDDEN", "Solo lectura"));
    expect((await scheduleAppointment(value())).error?.code).toBe("FORBIDDEN");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([null, { data: { appointment: { id: id(9) } }, error: null }, { data: null, error: "Rejected" }])(
    "rejects a malformed response",
    async data => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect((await scheduleAppointment(value())).error?.code).toBe("INTERNAL");
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );
  it.each([
    { patientId: "not-a-uuid" },
    { startsAt: "2026-09-15" },
    { urgency: "asap" },
    { reason: "ab" },
    { reason: "x".repeat(1001) },
  ])("validates %j without calling the database", async override => {
    expect((await scheduleAppointment({ ...value(), ...override } as ScheduleAppointmentInput)).error?.code).toBe("VALIDATION");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
