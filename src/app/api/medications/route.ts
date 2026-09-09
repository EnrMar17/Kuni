import "server-only";

import { NextResponse } from "next/server";

import { toApiError, type AppErrorCode } from "@/contracts/errors";
import { listActiveMedications } from "@/lib/queries/patient-registration";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  CONFLICT: 409,
  PROVIDER_UNAVAILABLE: 503,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export async function GET() {
  try {
    return NextResponse.json(await listActiveMedications());
  } catch (error) {
    const { error: apiError } = toApiError(error);
    if (!apiError) return NextResponse.json({ code: "INTERNAL", message: "Error inesperado del servidor." }, { status: 500 });
    return NextResponse.json(apiError, { status: STATUS_BY_CODE[apiError.code] });
  }
}
