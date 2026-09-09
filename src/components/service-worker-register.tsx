"use client";

import { useEffect, useState } from "react";

/**
 * Registra public/sw.js — lo que hace que Kuni sea instalable y tenga una
 * pantalla propia sin conexión.
 *
 * Va como componente de cliente (no como <script> inline) a propósito: la CSP
 * con nonce del proxy solo confía en los chunks que carga Next, así que un
 * inline suelto quedaría bloqueado.
 *
 * Cuando hay una versión nueva NO se recarga sola: en medio de una consulta,
 * perder un formulario a medias sería peor que ver la versión anterior un
 * rato. Se avisa y el usuario decide.
 */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo el SW cachearía chunks que Next regenera en cada edición.
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        // `waiting` ya presente: la pestaña se abrió con una versión nueva lista.
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Sin `controller` es la primera instalación: no hay nada que avisar.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      })
      .catch((error) => {
        // Un SW que no registra no debe romper la app: solo se pierde el modo
        // sin conexión.
        console.error("[kuni] no se pudo registrar el service worker", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#0a4470] px-4 py-3 text-sm text-white shadow-lg"
      role="status"
    >
      <span className="flex-1">Hay una versión nueva de Kuni.</span>
      <button
        className="rounded-full bg-white px-3 py-1.5 font-medium text-[#0a4470]"
        onClick={() => {
          // El SW llama a skipWaiting y toma control; recargar trae el código nuevo.
          waiting.postMessage("kuni:skip-waiting");
          navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
            once: true,
          });
        }}
        type="button"
      >
        Actualizar
      </button>
      <button
        aria-label="Descartar aviso de actualización"
        className="rounded-full px-2 py-1 text-white/70 transition hover:text-white"
        onClick={() => setWaiting(null)}
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
