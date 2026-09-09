import type { Metadata } from "next";
import Image from "next/image";

import { logout, selectConsultingRoom } from "@/actions/auth";
import { getPageAuthContext } from "@/lib/auth/context";
import { postLoginRedirect } from "@/lib/auth/navigation";
import { getConsultingRooms, type ConsultingRoomSummary } from "@/lib/queries/consulting-rooms";

export const metadata: Metadata = {
  title: "Seleccionar consultorio",
  description: "Selecciona el consultorio con el que trabajarás en esta sesión.",
};

type PageProps = {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
};

export default async function ConsultingRoomsPage({ searchParams }: PageProps) {
  const { error, redirectTo } = await searchParams;
  const context = await getPageAuthContext();
  let rooms: ConsultingRoomSummary[] = [];
  let loadError = false;
  try {
    ({ rooms } = await getConsultingRooms());
  } catch {
    loadError = true;
  }
  const destination = postLoginRedirect(typeof redirectTo === "string" ? redirectTo : null);

  return (
    <main
      id="contenido-principal"
      className="consultorios-shell relative flex min-h-screen items-center justify-center overflow-hidden p-3 text-slate-800 md:p-6 lg:p-8"
    >
      <div aria-hidden="true" className="splash-glow splash-glow-a" />
      <div aria-hidden="true" className="splash-glow splash-glow-b" />
      <div className="dashboard-shadow-floating relative z-10 w-full max-w-[1180px] overflow-hidden rounded-[36px] border border-white/70 bg-white/95 p-5 shadow-2xl shadow-[#0a4470]/12 backdrop-blur-sm sm:p-8 lg:p-10">
        <header className="flex items-center justify-between border-b border-[#0a4470]/10 pb-6">
          <span className="inline-flex items-center gap-2.5 font-extrabold tracking-tight text-[#001d39]">
            <Image alt="Kuni" className="h-auto w-8" height={530} src="/brand/kuni-mark.png" width={640} />
            <span className="text-lg">Kuni</span>
          </span>
          <form action={logout}>
            <button className="rounded-full border border-[#0a4470]/12 bg-white px-4 py-2 text-xs font-semibold text-[#0a4470] shadow-sm transition hover:bg-[#eaf6ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#51c2ff]" type="submit">
              Salir
            </button>
          </form>
        </header>

        <section className="mx-auto max-w-5xl py-10 sm:py-14">
          <div className="text-center">
            <span className="inline-flex rounded-full border border-[#51c2ff]/30 bg-[#eaf6ff] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0a4470]">
              {context.unitCode ?? "Unidad de salud"}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#001d39] sm:text-4xl">
              Selecciona tu consultorio
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              El médico se identifica automáticamente con el consultorio. Esta selección limita el contexto visible durante la sesión.
            </p>
          </div>

          {error || loadError ? (
            <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-800" role="alert">
              {loadError || error === "conexion" ? "No pudimos cargar los consultorios. Actualiza la página para intentar nuevamente." : "No pudimos seleccionar ese consultorio. Elige uno habilitado para tu unidad."}
            </p>
          ) : null}

          <div className="mt-10 flex flex-wrap justify-center gap-5">
            {rooms.map((room, index) => {
              const initials = room.doctor.fullName
                .split(" ")
                .filter((part) => !part.includes("."))
                .slice(0, 2)
                .map((part) => part[0])
                .join("");

              return (
                <article className="dashboard-shadow-soft group relative w-full max-w-[380px] flex-1 basis-[320px] overflow-hidden rounded-[28px] border border-slate-100 bg-white p-6 transition hover:border-[#51c2ff]/40 hover:shadow-xl motion-safe:hover:-translate-y-1" key={room.id}>
                  <div aria-hidden="true" className={`absolute right-0 top-0 size-28 rounded-bl-full ${index === 0 ? "bg-[#eaf6ff]" : "bg-[#e7edf3]"}`} />
                  <div className="relative flex items-start justify-between gap-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1c7fb0]">{room.name}</p>
                      <h2 className="mt-3 text-xl font-extrabold text-slate-900">{room.doctor.fullName}</h2>
                      <p className="mt-1 text-xs font-medium text-slate-400">{room.doctor.professionalLicense ? `Céd. ${room.doctor.professionalLicense}` : "Cédula no registrada"}</p>
                    </div>
                    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-extrabold shadow-sm ${index === 0 ? "bg-[#eaf6ff] text-[#0a4470]" : "bg-[#e7edf3] text-[#0a4470]"}`}>
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

                  <form action={selectConsultingRoom} className="relative mt-5">
                    <input name="roomId" type="hidden" value={room.id} />
                    <input name="redirectTo" type="hidden" value={destination} />
                    <button className="group/btn flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#001d39] px-4 text-sm font-bold text-white shadow-lg shadow-[#0a4470]/20 transition hover:-translate-y-0.5 hover:bg-[#012c52] hover:shadow-xl hover:shadow-[#0a4470]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#51c2ff]">
                      Entrar al consultorio
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4 text-[#51c2ff] transition-transform duration-300 group-hover/btn:translate-x-1"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M4.5 12h13.5M12.5 6l6 6-6 6"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.6"
                        />
                      </svg>
                    </button>
                  </form>
                </article>
              );
            })}
          </div>

          {!loadError && rooms.length === 0 ? (
            <p className="mt-8 text-center text-sm leading-6 text-slate-500" role="status">
              No hay consultorios habilitados con un médico activo. Contacta a quien administra tu unidad.
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-slate-400">
            <span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-emerald-500" />Sesión activa</span>
            <span>Aislamiento por unidad</span>
            <span>{context.role === "viewer" ? "Permiso de solo lectura" : "Acceso clínico autorizado"}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
