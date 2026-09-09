import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PatientProfile } from "@/components/clinical-workspace";
import { PatientPredictionPanel, PatientPredictionSkeleton } from "@/components/patient-prediction-panel";
import { getPageAuthContext } from "@/lib/auth/context";
import { serverEnv } from "@/lib/env/server";
import { getDashboardData } from "@/lib/queries/dashboard";

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
  return (
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
  );
}
