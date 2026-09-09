import { PatientProfileView } from "@/components/patient-profile-view";
import { serverEnv } from "@/lib/env/server";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const provider = serverEnv.MESSAGE_PROVIDER ?? serverEnv.WHATSAPP_PROVIDER;
  const testMessageChannels: ("sms" | "whatsapp")[] = [];
  if (provider === "sms8" || provider === "smsgate") testMessageChannels.push("sms");
  if (serverEnv.TWILIO_ACCOUNT_SID && serverEnv.TWILIO_AUTH_TOKEN && serverEnv.TWILIO_WHATSAPP_FROM) {
    testMessageChannels.push("whatsapp");
  }
  return <PatientProfileView patientId={patientId} testMessageChannels={testMessageChannels} />;
}
