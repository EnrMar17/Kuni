import type { PatientSummary } from "@/contracts";

export type HealthUnitFixture = {
  id: string;
  code: string;
  name: string;
};

export type ConsultingRoomFixture = {
  id: string;
  unitId: string;
  name: string;
  doctor: {
    id: string;
    fullName: string;
    professionalLicense: string;
  };
  patientCount: number;
  openAlertCount: number;
};

export const fixtureUnit: HealthUnitFixture = {
  id: "e39f8294-c9ef-45e4-adf4-79bfd5f50300",
  code: "CS-MOR-01",
  name: "Centro de Salud Morelia Norte",
};

export const fixtureRooms: ConsultingRoomFixture[] = [
  {
    id: "5b506282-a9d3-4b3f-87ec-ad91b24ead87",
    unitId: fixtureUnit.id,
    name: "Consultorio 1",
    doctor: {
      id: "a941f49a-dd66-4bd3-aa23-49f7d6c4aa70",
      fullName: "Dra. Lucía Torres",
      professionalLicense: "Céd. 12345678",
    },
    patientCount: 18,
    openAlertCount: 3,
  },
  {
    id: "d280f1d5-4774-4e80-8cfa-d1677683fd84",
    unitId: fixtureUnit.id,
    name: "Consultorio 2",
    doctor: {
      id: "2b6192a5-8a29-4f66-bef8-eaa409b4a648",
      fullName: "Dr. Mateo Hernández",
      professionalLicense: "Céd. 87654321",
    },
    patientCount: 14,
    openAlertCount: 1,
  },
];

export const fixturePatients: PatientSummary[] = [
  {
    id: "2614da34-cbbb-46bc-9635-845e185691cc",
    clinicalRecord: "EXP-1042",
    fullName: "María Elena Ruiz",
    age: 62,
    diagnoses: ["Diabetes tipo 2", "Hipertensión"],
    risk: "high",
    riskReasons: ["Medición fuera de límite personalizado"],
    confirmedAdherencePct: 72,
    responseCoveragePct: 81,
    nextAppointmentAt: "2026-09-09T16:00:00.000Z",
  },
  {
    id: "12613454-d231-4a1a-b93d-ea8fc96d8f3b",
    clinicalRecord: "EXP-1098",
    fullName: "José Luis Mendoza",
    age: 55,
    diagnoses: ["Hipertensión"],
    risk: "medium",
    riskReasons: ["Tres solicitudes pendientes en siete días"],
    confirmedAdherencePct: 88,
    responseCoveragePct: 66,
    nextAppointmentAt: "2026-09-10T17:30:00.000Z",
  },
  {
    id: "f624a4fc-4074-42b8-9ced-1cb475c44170",
    clinicalRecord: "EXP-1107",
    fullName: "Carmen Aguilar",
    age: 48,
    diagnoses: ["Diabetes tipo 2"],
    risk: "low",
    riskReasons: [],
    confirmedAdherencePct: 94,
    responseCoveragePct: 92,
    nextAppointmentAt: "2026-09-12T15:00:00.000Z",
  },
];

export const fixtureCredentials = {
  email: "demo@kuni.mx",
  password: "KuniDemo2026",
} as const;

export function getFixtureRoom(roomId: string) {
  return fixtureRooms.find((room) => room.id === roomId) ?? null;
}
