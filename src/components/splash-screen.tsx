import Image from "next/image";
import Link from "next/link";

import { InstallAppButton } from "@/components/install-app-button";

/**
 * Pantalla de bienvenida — primer contacto antes de pedir credenciales.
 * Solo marca y una acción; el login real (formulario, errores, redirectTo)
 * sigue viviendo en /login (ver LoginForm). No duplica esa lógica aquí.
 *
 * Fondo y mariposas son SVG + CSS puro (las animaciones "splash-*"/"kuni-*"
 * viven en globals.css). La única librería nueva es animate.css — CSS puro,
 * sin JS ni runtime propio — usada en el saludo y disponible para el resto
 * de la app.
 *
 * El vuelo de las mariposas es decorativo puro (no transmite información),
 * así que a propósito NO se apaga con "reducir movimiento": globals.css
 * trae una excepción explícita para ellas dentro de ese bloque — es la
 * única animación de la app con esa excepción, y está documentada ahí.
 */
const BUTTERFLIES = [
  { path: "a", color: "#3aa9ec", accent: "#bfe7fc", top: "14%", left: "8%", size: 40, flap: 300, duration: 24, delay: 0 },
  { path: "b", color: "#e8933f", accent: "#ffd9ac", top: "60%", left: "6%", size: 26, flap: 260, duration: 18, delay: 2.2 },
  { path: "c", color: "#164a72", accent: "#8ed7fb", top: "20%", left: "83%", size: 34, flap: 340, duration: 27, delay: 1.4 },
  { path: "a", color: "#8ed7fb", accent: "#f2fafe", top: "76%", left: "86%", size: 20, flap: 280, duration: 20, delay: 4.1 },
  { path: "b", color: "#2f6690", accent: "#bfe7fc", top: "44%", left: "92%", size: 24, flap: 310, duration: 23, delay: 3 },
  { path: "c", color: "#e8933f", accent: "#ffe6c9", top: "82%", left: "20%", size: 18, flap: 250, duration: 17, delay: 1.8 },
] as const;

function Butterfly({ path, color, accent, top, left, size, flap, duration, delay }: (typeof BUTTERFLIES)[number]) {
  return (
    <div
      aria-hidden="true"
      className={`splash-butterfly splash-flight-${path}`}
      style={{
        top,
        left,
        width: size,
        // @ts-expect-error -- custom properties read by the keyframes in globals.css
        "--butterfly-duration": `${duration}s`,
        "--butterfly-delay": `${delay}s`,
        "--butterfly-flap": `${flap}ms`,
      }}
    >
      <svg className="splash-butterfly-svg" height="100%" viewBox="0 0 40 34" width="100%">
        <g className="splash-wing splash-wing-left">
          <path d="M20 17C10 2 -5 1 0 14C-4 20 -2 27 8 27C15 27 19 22 20 17Z" fill={color} />
          <path
            d={`M20 17C14 8 4 6 3 13C1 19 6 22 12 21C16 20 19 19 20 17Z`}
            fill={accent}
            opacity={0.55}
          />
        </g>
        <g className="splash-wing splash-wing-right">
          <path d="M20 17C30 2 45 1 40 14C44 20 42 27 32 27C25 27 21 22 20 17Z" fill={color} />
          <path
            d={`M20 17C26 8 36 6 37 13C39 19 34 22 28 21C24 20 21 19 20 17Z`}
            fill={accent}
            opacity={0.55}
          />
        </g>
        <ellipse cx="20" cy="18" fill="#101f2c" rx="1.3" ry="8.5" />
        <circle cx="20" cy="9" fill="#101f2c" r="1.5" />
        <path d="M19 9C18 6 16.5 5 15.5 5.4M21 9C22 6 23.5 5 24.5 5.4" fill="none" stroke="#101f2c" strokeLinecap="round" strokeWidth="0.7" />
      </svg>
    </div>
  );
}

export function SplashScreen() {
  return (
    <main
      id="contenido-principal"
      className="splash-shell relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-10 text-center"
    >
      <div aria-hidden="true" className="splash-glow splash-glow-a" />
      <div aria-hidden="true" className="splash-glow splash-glow-b" />
      <div className="splash-scene">
        {BUTTERFLIES.map((b, i) => (
          <Butterfly key={i} {...b} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8">
        <p className="splash-brand-secondary animate__animated animate__fadeInDown text-sm font-extrabold uppercase tracking-[0.22em] text-[#0a4470] drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)] sm:text-base">
          Bienvenido a
        </p>
        <div className="flex flex-col items-center gap-3">
          <Image
            alt="Símbolo de Kuni"
            className="splash-mark h-auto w-48 sm:w-56"
            height={530}
            priority
            src="/brand/kuni-mark.png"
            width={640}
          />
          <h1 className="splash-brand-primary splash-mark text-5xl font-bold tracking-[0.04em] text-[#0a4470] drop-shadow-[0_3px_7px_rgba(255,255,255,0.95)] sm:text-6xl">
            Kuni
          </h1>
        </div>
        <Link
          aria-label="Continuar"
          className="splash-cta group flex h-16 w-16 items-center justify-center rounded-full bg-[#51c2ff] text-white shadow-lg shadow-[#0a4470]/30 transition hover:scale-105 hover:shadow-xl hover:shadow-[#0a4470]/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-95"
          href="/login"
        >
          <svg
            aria-hidden="true"
            className="h-7 w-7 drop-shadow-[0_1px_1px_rgba(10,68,112,0.25)] transition-transform duration-300 ease-out group-hover:translate-x-1"
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
        </Link>
        {/* Solo se pinta si el navegador confirma que Kuni es instalable. */}
        <InstallAppButton />
      </div>
    </main>
  );
}
