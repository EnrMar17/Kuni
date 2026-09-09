"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { login, type LoginState } from "@/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className="login-submit mt-1 flex min-h-13 cursor-pointer items-center justify-center rounded-2xl bg-[#001d39] px-5 text-sm font-bold text-white shadow-lg shadow-[#0a4470]/25 transition hover:-translate-y-0.5 hover:bg-[#012c52] hover:shadow-xl hover:shadow-[#0a4470]/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#51c2ff] disabled:cursor-wait disabled:translate-y-0 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Verificando…" : "Iniciar sesión"}
    </button>
  );
}

export function LoginForm({ redirectTo = "/dashboard", initialError = null }: {
  redirectTo?: string;
  initialError?: string | null;
}) {
  const initialState: LoginState = { error: initialError };
  const [state, action] = useActionState(login, initialState);
  const errorId = useId();
  const hasError = Boolean(state.error);
  const fieldDescribedBy = hasError ? errorId : undefined;

  return (
    <form action={action} className="login-form mt-8 grid gap-5" noValidate>
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <label className="grid gap-2 text-xs font-bold text-[#0a4470]" htmlFor="login-email">
        Correo de la unidad
        <span className="relative flex items-center">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 h-4.5 w-4.5 text-[#0a4470]/40"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
            <path d="m4 6.5 8 6.25 8-6.25" />
          </svg>
          <input
            aria-describedby={fieldDescribedBy}
            aria-invalid={hasError}
            autoComplete="username"
            className="min-h-13 w-full rounded-2xl border border-[#0a4470]/12 bg-white pl-11 pr-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#51c2ff] focus:ring-4 focus:ring-[#51c2ff]/25 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:bg-rose-50/40"
            id="login-email"
            name="email"
            required
            type="email"
          />
        </span>
      </label>
      <label className="grid gap-2 text-xs font-bold text-[#0a4470]" htmlFor="login-password">
        <span className="flex items-center justify-between gap-3">
          Contraseña
          <span className="font-medium text-slate-400">Acceso de la unidad</span>
        </span>
        <span className="relative flex items-center">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 h-4.5 w-4.5 text-[#0a4470]/40"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <rect height="10" rx="2" width="14" x="5" y="11" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <input
            aria-describedby={fieldDescribedBy}
            aria-invalid={hasError}
            autoComplete="current-password"
            className="min-h-13 w-full rounded-2xl border border-[#0a4470]/12 bg-white pl-11 pr-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#51c2ff] focus:ring-4 focus:ring-[#51c2ff]/25 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:bg-rose-50/40"
            id="login-password"
            name="password"
            required
            type="password"
          />
        </span>
      </label>
      {state.error ? (
        <p
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
          id={errorId}
          role="alert"
        >
          <svg aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
