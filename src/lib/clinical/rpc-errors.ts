import { AppError } from "@/contracts/errors";

export type ClinicalRpcFailure = { code?: string | null; message?: string | null };

const rpcErrorCodes: Record<string, AppError["code"]> = {
  PT401: "UNAUTHENTICATED",
  PT403: "FORBIDDEN",
  PT409: "CONFLICT",
  PT422: "VALIDATION",
};

export function mapClinicalRpcFailure(error: ClinicalRpcFailure): AppError {
  const code = error.code ? rpcErrorCodes[error.code] : undefined;
  if (code) return new AppError(code, error.message || "No se pudo actualizar la alerta.");
  return new AppError("INTERNAL", "No se pudo actualizar la alerta.");
}
