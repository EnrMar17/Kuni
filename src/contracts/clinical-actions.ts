import { z } from "zod";
import { alertResolutionInputSchema } from "./clinical";

// Los esquemas son contratos; un módulo `use server` exporta solo acciones async.
export const resolveAlertRpcInputSchema = alertResolutionInputSchema.extend({
  patientId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export const medicationTherapeuticClassInputSchema = z.object({
  patientId: z.uuid(),
  prescriptionId: z.uuid(),
  medicationId: z.uuid(),
  therapeuticClass: z.enum(["antidiabetic", "antihypertensive", "other"]),
});
