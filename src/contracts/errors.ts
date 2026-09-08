/**
 * Contrato de error compartido por toda la app (server queries, Server
 * Actions, Route Handlers). Ver kuni-plan-tecnico.md sección 5: la respuesta
 * común es `{ data, error: { code, message, fields } | null }`.
 *
 * UNAUTHENTICATED / FORBIDDEN / VALIDATION / CONFLICT / PROVIDER_UNAVAILABLE
 * son los códigos que define el plan. NOT_FOUND e INTERNAL son extensiones
 * de implementación (no cambian el contrato, solo lo completan) — si alguien
 * más del equipo necesita otro código, se agrega aquí, no se inventa suelto.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "PROVIDER_UNAVAILABLE"
  | "NOT_FOUND"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: AppErrorCode,
    message: string,
    fields?: Record<string, string[]>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }
}

export type ApiError = {
  code: AppErrorCode;
  message: string;
  fields?: Record<string, string[]>;
};

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

export function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

/**
 * Convierte cualquier excepción capturada en la forma de error del contrato.
 * Un AppError conserva su código/mensaje; cualquier otra cosa (bug, fallo de
 * red, etc.) se oculta detrás de INTERNAL y se registra en el log del
 * servidor — nunca se filtra el mensaje interno al cliente.
 */
export function toApiError(err: unknown): ApiResult<never> {
  if (err instanceof AppError) {
    return { data: null, error: { code: err.code, message: err.message, fields: err.fields } };
  }
  console.error("[kuni] error inesperado:", err);
  return {
    data: null,
    error: { code: "INTERNAL", message: "Error inesperado del servidor." },
  };
}
