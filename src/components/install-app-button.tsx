"use client";

import { useEffect, useState } from "react";

/**
 * Botón "Instalar app". Solo aparece cuando el navegador confirma que Kuni es
 * instalable (evento `beforeinstallprompt`, es decir: manifiesto válido,
 * service worker activo y HTTPS). Si el navegador no lo dispara — Safari/iOS,
 * o porque ya está instalada — el componente no renderiza nada, así que nunca
 * se muestra un botón que no haría nada.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton({ className }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Sin preventDefault el navegador muestra su propio mini-infobar y ya no
      // se puede lanzar el diálogo desde nuestro botón.
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  return (
    <button
      className={
        className ??
        "rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-[#0a4470] shadow-sm transition hover:bg-sky-50"
      }
      onClick={async () => {
        await promptEvent.prompt();
        // El evento es de un solo uso: aceptado o no, ya no sirve otra vez.
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
      type="button"
    >
      Instalar app
    </button>
  );
}
