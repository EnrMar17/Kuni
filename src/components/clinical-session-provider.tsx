"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ClinicalSession = {
  unitName: string;
  role: "shared_clinician" | "clinician" | "viewer";
  room: {
    id: string;
    name: string;
    doctorName: string;
  } | null;
};

const ClinicalSessionContext = createContext<ClinicalSession | null>(null);

/**
 * Mantiene el contexto de presentación durante toda la navegación protegida.
 * La autorización real sigue ocurriendo en servidor en cada lectura/escritura;
 * este contexto solo evita volver a consultar los mismos datos para pintar UI.
 */
export function ClinicalSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: ClinicalSession;
}) {
  return (
    <ClinicalSessionContext.Provider value={session}>
      {children}
    </ClinicalSessionContext.Provider>
  );
}

export function useClinicalSession() {
  const session = useContext(ClinicalSessionContext);
  if (!session) {
    throw new Error("ClinicalSessionProvider no está disponible.");
  }
  return session;
}

export function useOptionalClinicalSession() {
  return useContext(ClinicalSessionContext);
}
