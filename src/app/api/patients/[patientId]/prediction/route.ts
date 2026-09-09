import "server-only";

import { NextResponse } from "next/server";

import { toApiError, type AppErrorCode } from "@/contracts/errors";
import { getPatientPrediction } from "@/lib/ml/predict-patient";
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

export async function GET(_request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const [{ patientId }, data] = await Promise.all([params, getDashboardData()]);
    const patient = data.patients.find((item) => item.id === patientId);
    if (!patient) {
      return NextResponse.json({ code: "NOT_FOUND", message: "No se encontró el paciente solicitado." }, { status: 404 });
    }
    return NextResponse.json(await getPatientPrediction(patient, new Date(data.generatedAt)));
  } catch (error) {
    const { error: apiError } = toApiError(error);
    if (!apiError) return NextResponse.json({ code: "INTERNAL", message: "Error inesperado del servidor." }, { status: 500 });
    return NextResponse.json(apiError, { status: STATUS_BY_CODE[apiError.code] });
  }
}
