"use server";

import { revalidatePath } from "next/cache";

import { ok, toApiError, type ApiResult } from "@/contracts/errors";
import {
  manualSmsTestInputSchema,
  type ManualSmsTestInput,
  type ManualSmsTestResult,
} from "@/contracts/messaging";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { sendManualSmsTest } from "@/lib/jobs/manual-sms-test";

export async function sendManualSmsTestAction(
  input: ManualSmsTestInput,
): Promise<ApiResult<ManualSmsTestResult>> {
  const parsed = manualSmsTestInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "La solicitud de prueba SMS no es válida." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const result = await sendManualSmsTest({
      ...parsed.data,
      unitId: context.unitId,
      roomId: context.consultingRoom.id,
    });
    revalidatePath(`/pacientes/${parsed.data.patientId}`);
    return ok(result);
  } catch (error) {
    return toApiError(error);
  }
}
