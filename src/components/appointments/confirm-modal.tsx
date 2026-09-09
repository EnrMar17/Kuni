"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/appointments/icons";

/**
 * Ventanita centrada para aceptar/rechazar el resumen de la cita antes de
 * guardarla. Reemplaza la sección inline que antes se abría dentro del
 * formulario: ahora el resumen se confirma o se descarta en un diálogo
 * modal, sin perder el resto de los datos capturados.
 */
export function ConfirmModal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  onConfirm,
  confirmLabel = "Confirmar y guardar",
  isConfirming = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  isConfirming?: boolean;
  error?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      aria-labelledby="confirm-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
    >
      <div
        className="motion-safe:animate-[kuni-rise_200ms_ease-out_both] absolute inset-0 bg-[#001428]/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="motion-safe:animate-[kuni-modal-pop_260ms_cubic-bezier(.2,.9,.25,1)_both] relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-2xl shadow-slate-900/25"
        ref={cardRef}
      >
        <div className="relative overflow-hidden border-b border-sky-100 bg-sky-100 px-6 py-5">
          <span aria-hidden="true" className="absolute -right-6 -top-10 size-28 rounded-full bg-sky-200/40" />
          {eyebrow ? (
            <span className="relative text-[11px] font-bold uppercase tracking-widest text-[#1c7fb0]">
              {eyebrow}
            </span>
          ) : null}
          <h2 className="relative mt-1 text-lg font-extrabold text-slate-900" id="confirm-modal-title">
            {title}
          </h2>
          <button
            aria-label="Cerrar"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/80 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-4" name="close" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {error ? (
          <p className="mx-6 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button
            className="clinical-button"
            disabled={isConfirming}
            onClick={onClose}
            type="button"
          >
            <Icon className="size-4" name="close" />
            Rechazar
          </button>
          <button
            className="clinical-button clinical-button-primary"
            data-autofocus
            disabled={isConfirming}
            onClick={onConfirm}
            type="button"
          >
            <Icon className="size-4" name="check" />
            {isConfirming ? "Guardando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
