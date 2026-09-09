"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DashboardPatient } from "@/lib/domain/dashboard";
import { initials, riskLabels } from "@/components/dashboard/presentation";
import { normalizeSearch } from "@/components/dashboard/presentation";
import { Icon } from "@/components/appointments/icons";

const riskDot = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  unknown: "bg-slate-300",
} as const;

/**
 * Selector de paciente con búsqueda: reemplaza el <select> nativo cuando el
 * consultorio tiene muchos pacientes. Mantiene la semántica de un campo de
 * formulario controlado (value = patientId) para integrarse con
 * react-hook-form vía setValue/trigger en el padre.
 */
export function PatientPicker({
  patients,
  value,
  onChange,
  invalid,
  describedBy,
  onBlurField,
  inputId: providedInputId,
}: {
  patients: DashboardPatient[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  describedBy?: string;
  onBlurField?: () => void;
  inputId?: string;
}) {
  const generatedInputId = useId();
  const inputId = providedInputId ?? generatedInputId;
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = patients.find((patient) => patient.id === value) ?? null;

  const results = useMemo(() => {
    const search = normalizeSearch(query);
    if (!search) return patients.slice(0, 40);
    return patients
      .filter((patient) =>
        normalizeSearch(`${patient.fullName} ${patient.clinicalRecord} ${patient.curp ?? ""}`).includes(search),
      )
      .slice(0, 40);
  }, [patients, query]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(patient: DashboardPatient) {
    onChange(patient.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  const displayValue = open ? query : selected ? `${selected.fullName} · ${selected.clinicalRecord}` : query;

  return (
    <div className="relative" ref={rootRef}>
      <div
        className={`flex items-center gap-2.5 rounded-2xl border bg-white/95 pl-3.5 pr-2.5 shadow-inner transition ${
          invalid ? "border-rose-300 bg-rose-50/40" : open ? "border-sky-300 ring-4 ring-sky-100" : "border-slate-200"
        }`}
      >
        {selected && !open ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-100 text-[10px] font-extrabold text-sky-800">
            {initials(selected.fullName)}
          </span>
        ) : (
          <Icon name="search" className="size-4 shrink-0 text-slate-400" />
        )}
        <input
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className="w-full min-w-0 border-0 bg-transparent py-2.5 text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
          id={inputId}
          onBlur={() => onBlurField?.()}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
            if (value) onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              if (open && results[activeIndex]) {
                event.preventDefault();
                pick(results[activeIndex]);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Buscar por nombre, CURP o expediente…"
          role="combobox"
          type="text"
          value={displayValue}
        />
        {selected ? (
          <button
            aria-label="Quitar paciente seleccionado"
            className="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            type="button"
          >
            <Icon name="close" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul
          className="animate-[kuni-rise_180ms_ease-out_both] absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl shadow-slate-900/10"
          id={listId}
          role="listbox"
        >
          {results.length ? (
            results.map((patient, index) => (
              <li key={patient.id}>
                <button
                  aria-selected={patient.id === value}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    index === activeIndex ? "bg-sky-50" : "hover:bg-slate-50"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(patient)}
                  role="option"
                  type="button"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-100 text-[10px] font-extrabold text-sky-800">
                    {initials(patient.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <strong className="truncate text-xs font-bold text-slate-900">{patient.fullName}</strong>
                      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${riskDot[patient.risk.level]}`} />
                    </span>
                    <span className="font-mono-data block truncate text-[11px] text-slate-500">
                      {patient.clinicalRecord} · {riskLabels[patient.risk.level]}
                    </span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-xs font-medium text-slate-400">
              Sin coincidencias para “{query}”.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
