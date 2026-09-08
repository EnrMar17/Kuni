import type { Metadata } from "next";

import { logout, selectFixtureRoom } from "@/actions/auth";
import { KuniMark } from "@/components/kuni-mark";
import { fixtureRooms, fixtureUnit } from "@/lib/queries/fixtures";

export const metadata: Metadata = {
  title: "Seleccionar consultorio",
  description: "Selecciona el consultorio con el que trabajarás en esta sesión.",
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ConsultingRoomsPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <div className="dashboard-shadow-floating w-full max-w-[1180px] overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#f7f8fc] p-5 sm:p-8 lg:p-10">
        <header className="flex items-center justify-between border-b border-slate-200/60 pb-6">
          <KuniMark />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold text-slate-800">{fixtureUnit.name}</p>
              <p className="text-[10px] font-medium text-slate-400">{fixtureUnit.code} · Datos ficticios</p>
            </div>
            <form action={logout}>
              <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50" type="submit">
                Salir
              </button>
            </form>
          </div>
        </header>

        <section className="mx-auto max-w-5xl py-10 sm:py-14">
          <div className="text-center">
            <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
              {fixtureUnit.code}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Selecciona tu consultorio
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              El médico se identifica automáticamente con el consultorio. Esta selección limita el contexto visible durante la sesión.
            </p>
          </div>

          {error ? (
            <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-700" role="alert">
              No pudimos seleccionar ese consultorio. Intenta nuevamente.
            </p>
          ) : null}

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {fixtureRooms.map((room, index) => {
              const initials = room.doctor.fullName
                .split(" ")
                .filter((part) => !part.includes("."))
                .slice(0, 2)
                .map((part) => part[0])
                .join("");

              return (
                <article className="dashboard-shadow-soft group relative overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl" key={room.id}>
                  <div aria-hidden="true" className={`absolute right-0 top-0 size-28 rounded-bl-full ${index === 0 ? "bg-indigo-50" : "bg-sky-50"}`} />
                  <div className="relative flex items-start justify-between gap-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">{room.name}</p>
                      <h2 className="mt-3 text-xl font-extrabold text-slate-900">{room.doctor.fullName}</h2>
                      <p className="mt-1 text-xs font-medium text-slate-400">{room.doctor.professionalLicense}</p>
                    </div>
                    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-extrabold shadow-sm ${index === 0 ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"}`}>
                      {initials}
                    </span>
                  </div>

                  <dl className="relative mt-8 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pacientes</dt>
                      <dd className="font-mono-data mt-1 text-2xl font-extrabold text-slate-900">{room.patientCount}</dd>
                    </div>
                    <div className="rounded-2xl bg-rose-50/70 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-rose-400">Alertas abiertas</dt>
                      <dd className="font-mono-data mt-1 text-2xl font-extrabold text-rose-600">{room.openAlertCount}</dd>
                    </div>
                  </dl>

                  <form action={selectFixtureRoom} className="relative mt-5">
                    <input name="roomId" type="hidden" value={room.id} />
                    <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#001d39] px-4 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                      Entrar al consultorio <span aria-hidden="true">→</span>
                    </button>
                  </form>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-slate-400">
            <span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-emerald-500" />Sesión activa</span>
            <span>Aislamiento por unidad</span>
            <span>Entorno de demostración</span>
          </div>
        </section>
      </div>
    </main>
  );
}
