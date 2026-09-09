import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { PatientProfile } from "@/components/clinical-workspace";
import { PatientPredictionPanel, PatientPredictionSkeleton } from "@/components/patient-prediction-panel";
import { getPageAuthContext } from "@/lib/auth/context";
import { serverEnv } from "@/lib/env/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getQueryClient } from "@/lib/queries/get-query-client";
import { dashboardQueryKey } from "@/lib/queries/dashboard-keys";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const [{ patientId }, context, data] = await Promise.all([params, getPageAuthContext(), getDashboardData()]);
  const patient = data.patients.find((item) => item.id === patientId);
  if (!patient) notFound();
  const provider = serverEnv.MESSAGE_PROVIDER ?? serverEnv.WHATSAPP_PROVIDER;
  const testMessageChannels: ("sms" | "whatsapp")[] = [];
  if (provider === "sms8" || provider === "smsgate") testMessageChannels.push("sms");
  if (serverEnv.TWILIO_ACCOUNT_SID && serverEnv.TWILIO_AUTH_TOKEN && serverEnv.TWILIO_WHATSAPP_FROM) {
    testMessageChannels.push("whatsapp");
  }
  // Sembramos el mismo caché que usan censo/citas/alertas/estadísticas con la
  // data que este detalle ya cargó: volver a esas vistas reutiliza este
  // fetch en vez de repetirlo, sin cambiar nada de cómo se arma esta página.
  const queryClient = getQueryClient();
  queryClient.setQueryData(dashboardQueryKey, data);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PatientProfile
        canWrite={context.role !== "viewer"}
        testMessageChannels={testMessageChannels}
        context={{
          unitName: context.unitName,
          roomName: context.consultingRoom?.name ?? "Consultorio",
          doctorName: context.consultingRoom?.doctorName ?? "Personal clínico",
        }}
        data={data}
        patient={patient}
        predictionPanel={
          <Suspense
            key={`patient-prediction-${patient.id}`}
            fallback={<PatientPredictionSkeleton />}
          >
            <PatientPredictionPanel
              patient={patient}
              asOf={data.generatedAt}
              timezone={data.timezone}
            />
          </Suspense>
        }
      />
    </HydrationBoundary>
  );
}
