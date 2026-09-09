import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sin conexión",
  description: "Kuni necesita conexión para mostrar información clínica actualizada.",
};

/**
 * Página que el service worker devuelve cuando una navegación falla por falta
 * de red (ver public/sw.js).
 *
 * Se renderiza SIN JavaScript ni CSS externo, con estilos en línea, porque sin
 * conexión los chunks de `/_next/static` que no estén ya en caché no se pueden
 * descargar: una versión con componente de cliente se veía sin estilos y con
 * el botón muerto (comprobado en caliente). Por eso "Reintentar" es un enlace
 * con `href=""` — el navegador lo resuelve a la URL actual, que es la que el
 * usuario pidió y que el SW sustituyó por esta pantalla, así que reintenta esa
 * misma página sin necesidad de JS.
 *
 * Kuni tampoco guarda copias de datos clínicos para uso sin conexión, a
 * propósito: un expediente viejo mostrado como si fuera actual es peor que no
 * mostrar nada. Esta pantalla explica el estado en vez de simular la app.
 */
export default function OfflinePage() {
  return (
    <main
      id="contenido-principal"
      style={{
        alignItems: "center",
        // globals.css tampoco está garantizado sin conexión: el fondo de marca
        // también va en línea.
        background: "#f4f7f6",
        color: "#0f172a",
        display: "flex",
        flex: 1,
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        gap: "1.5rem",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "4rem 1.5rem",
        textAlign: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image serviría
          /_next/image, que no está en caché; el PNG sí (ver PRECACHE en sw.js). */}
      <img alt="Kuni" src="/brand/kuni-mark.png" style={{ height: "auto", opacity: 0.75, width: "4rem" }} />
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Sin conexión</h1>
      <p style={{ color: "#475569", margin: 0, maxWidth: "28rem", lineHeight: 1.6 }}>
        Kuni no puede mostrar información clínica sin conexión, porque un dato desactualizado puede llevar a una
        decisión equivocada. Revisa tu red e inténtalo de nuevo.
      </p>
      <a
        href=""
        style={{
          background: "#0a4470",
          borderRadius: "9999px",
          color: "white",
          fontWeight: 500,
          padding: "0.75rem 1.5rem",
          textDecoration: "none",
        }}
      >
        Reintentar
      </a>
    </main>
  );
}
