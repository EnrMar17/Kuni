"use client";

import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { isValid, parseISO } from "date-fns";
import { KuniDayPicker } from "@/components/appointments/kuni-day-picker";
import { Icon } from "@/components/appointments/icons";
import "./kuni-date-input.css";

function readDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

/** Preserves the native date input contract used by RHF and controlled forms. */
export const KuniDateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function KuniDateInput(props, forwardedRef) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [picker, setPicker] = useState<{ month: Date; selected: Date | undefined; today: Date } | null>(null);

  useEffect(() => {
    if (picker && !dialog.current?.open) dialog.current?.showModal();
  }, [picker]);

  function open() {
    if (!input.current || input.current.matches(":disabled") || input.current.readOnly) return;
    const selected = readDate(input.current.value);
    const today = new Date();
    setPicker({ selected, month: selected ?? today, today });
  }

  function choose(date: Date | undefined) {
    const element = input.current;
    if (!element) return;
    const value = date ? `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
    // Bypass React's value tracker so its normal onChange handler receives the edit.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    dialog.current?.close();
  }

  return <span className="kuni-date-field">
    <input {...props} type="date" ref={element => {
      input.current = element;
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    }} onKeyDown={event => {
      props.onKeyDown?.(event);
      if (!event.defaultPrevented && ((event.altKey && event.key === "ArrowDown") || event.key === "F4")) {
        event.preventDefault(); open();
      }
    }} />
    <button className="kuni-date-trigger" type="button" aria-label="Abrir calendario" aria-haspopup="dialog"
      disabled={props.disabled || props.readOnly} onClick={event => { event.preventDefault(); open(); }}>
      <Icon name="calendar" className="size-4" />
    </button>
    {picker ? createPortal(<dialog ref={dialog} className="kuni-date-dialog" aria-labelledby={titleId}
      onClose={() => setPicker(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="kuni-date-dialog-content">
        <h2 id={titleId}>Seleccionar fecha</h2>
        <div className="kuni-date-navigation">
          <label>Mes<select aria-label="Mes" value={picker.month.getMonth()} onChange={event => {
            const month = new Date(picker.month); month.setDate(1); month.setMonth(Number(event.target.value)); setPicker({ ...picker, month });
          }}>
            {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Intl.DateTimeFormat("es", { month: "long" }).format(new Date(2020, month, 1))}</option>)}
          </select></label>
          <label>Año<input type="number" min={1} max={9999} value={picker.month.getFullYear()} onChange={event => {
            const year = Number(event.target.value);
            if (year >= 1 && year <= 9999) {
              const month = new Date(picker.month); month.setFullYear(year); setPicker({ ...picker, month });
            }
          }} /></label>
        </div>
        <KuniDayPicker className="kuni-calendar--compact" selected={picker.selected} today={picker.today}
          month={picker.month} onMonthChange={month => setPicker({ ...picker, month })} onSelect={choose}
          disabledBefore={readDate(String(props.min ?? ""))} disabledAfter={readDate(String(props.max ?? ""))} />
        <div className="kuni-date-dialog-actions">
          <button type="button" className="clinical-button" onClick={() => choose(undefined)}>Limpiar fecha</button>
          <button type="button" className="clinical-button" onClick={() => dialog.current?.close()}>Cerrar</button>
        </div>
      </div>
    </dialog>, document.body) : null}
  </span>;
});
