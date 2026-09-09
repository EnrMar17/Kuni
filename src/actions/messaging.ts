"use server";

import { revalidatePath } from "next/cache";

import { ok, toApiError, type ApiResult } from "@/contracts/errors";
import {
  manualMessageTestInputSchema,
  type ManualMessageTestInput,
  type ManualMessageTestResult,
} from "@/contracts/messaging";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { sendManualMessageTest } from "@/lib/jobs/manual-sms-test";

export async function sendManualMessageTestAction(
  input: ManualMessageTestInput,
): Promise<ApiResult<ManualMessageTestResult>> {
  const parsed = manualMessageTestInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "La solicitud de prueba SMS no es válida." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const result = await sendManualMessageTest({
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
