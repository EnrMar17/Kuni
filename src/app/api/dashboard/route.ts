import "server-only";
import { NextResponse } from "next/server";

import { toApiError } from "@/contracts/errors";
import type { AppErrorCode } from "@/contracts/errors";
import { getDashboardData } from "@/lib/queries/dashboard";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  CONFLICT: 409,
  PROVIDER_UNAVAILABLE: 503,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/**
 * Único punto de entrada HTTP para el snapshot clínico (`getDashboardData`,
 * sin tocar). Existe solo para que el caché de cliente (TanStack Query en
 * `useDashboardData`) pueda refrescar datos tras una mutación o al vencer el
 * `staleTime`, sin repetir la carga completa de la página. La misma función
 * de negocio se sigue llamando directo (sin HTTP) cuando el servidor
 * precarga/hidrata el caché en el primer render de cada página.
 */
export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    const { error: apiError } = toApiError(error);
    if (!apiError) return NextResponse.json({ code: "INTERNAL", message: "Error inesperado del servidor." }, { status: 500 });
    return NextResponse.json(apiError, { status: STATUS_BY_CODE[apiError.code] });
  }
}
