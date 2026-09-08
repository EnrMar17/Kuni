"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginWithFixture, type LoginState } from "@/actions/auth";
import { fixtureCredentials } from "@/lib/queries/fixtures";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#001d39] px-5 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Verificando…" : "Entrar a la unidad"}
      {!pending ? <span aria-hidden="true">→</span> : null}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginWithFixture, initialState);

  return (
    <form action={action} className="mt-8 grid gap-5">
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        Correo de la unidad
        <input
          autoComplete="username"
          className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          defaultValue={fixtureCredentials.email}
          name="email"
          required
          type="email"
        />
      </label>
      <label className="grid gap-2 text-xs font-bold text-slate-700">
        <span className="flex items-center justify-between">
          Contraseña
          <span className="font-medium text-slate-400">Acceso de demostración</span>
        </span>
        <input
          autoComplete="current-password"
          className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          defaultValue={fixtureCredentials.password}
          name="password"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
      <p className="text-center text-[11px] leading-5 text-slate-400">
        Acceso provisional con fixtures. Supabase Auth sustituirá esta sesión.
      </p>
    </form>
  );
}
