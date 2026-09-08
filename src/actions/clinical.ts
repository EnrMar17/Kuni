"use server";

import { z } from "zod";

import { AppError, ok, toApiError, type ApiResult } from "@/contracts/errors";
import { alertResolutionInputSchema } from "@/contracts/clinical";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

// `updated_at` is intentionally a string: converting it through Date can drop
// microseconds and turn a valid optimistic-concurrency token into a conflict.
export const resolveAlertRpcInputSchema = alertResolutionInputSchema.extend({
  patientId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export type ResolveAlertRpcInput = z.infer<typeof resolveAlertRpcInputSchema>;
export type ResolvedAlert = {
  id: string;
  status: "acknowledged" | "resolved" | "dismissed";
};

type RpcFailure = { code?: string | null; message?: string | null };
type RpcResponse = { data: unknown; error: RpcFailure | null };

const rpcErrorCodes: Record<string, AppError["code"]> = {
  PT401: "UNAUTHENTICATED",
  PT403: "FORBIDDEN",
  PT409: "CONFLICT",
  PT422: "VALIDATION",
};

export function mapClinicalRpcFailure(error: RpcFailure): AppError {
  const code = error.code ? rpcErrorCodes[error.code] : undefined;
  if (code)
    return new AppError(
      code,
      error.message || "No se pudo actualizar la alerta.",
    );
  return new AppError("INTERNAL", "No se pudo actualizar la alerta.");
}

function readResolvedAlert(payload: unknown): ResolvedAlert {
  const parsed = z
    .object({
      data: z.object({
        alert: z.object({
          id: z.uuid(),
          status: z.enum(["acknowledged", "resolved", "dismissed"]),
        }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError(
      "INTERNAL",
      "La operación de alerta devolvió una respuesta inválida.",
    );
  }
  return parsed.data.data.alert;
}

/**
 * Adapter for C's `resolve_alert` RPC. The route/UI remains disabled until
 * migrations 0002/0003 are applied and database types are regenerated.
 */
export async function resolveAlert(
  input: ResolveAlertRpcInput,
): Promise<ApiResult<ResolvedAlert>> {
  const parsed = resolveAlertRpcInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        code: "VALIDATION",
        message: "Revisa los datos de resolución de la alerta.",
      },
    };
  }

  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    // The generated Database type still represents the remote schema before
    // 0003. Keep this narrow cast here; remove it after `supabase gen types`.
    const rpc = supabase.rpc as unknown as (
      name: "resolve_alert",
      args: {
        p_patient_id: string;
        p_alert_id: string;
        p_expected_updated_at: string;
        p_next_status: string;
        p_reason: string;
        p_doctor_id: string;
      },
    ) => Promise<RpcResponse>;
    const response = await rpc("resolve_alert", {
      p_patient_id: parsed.data.patientId,
      p_alert_id: parsed.data.alertId,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_next_status: parsed.data.status,
      p_reason: parsed.data.note,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    return ok(readResolvedAlert(response.data));
  } catch (error) {
    return toApiError(error);
  }
}
