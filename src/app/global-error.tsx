"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[kuni] global error", error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body style={{ alignItems: "center", background: "#e8ebf2", color: "#0f172a", display: "flex", fontFamily: "system-ui, sans-serif", justifyContent: "center", margin: 0, minHeight: "100vh", padding: "1rem" }}>
        <main aria-live="assertive" role="alert" style={{ background: "white", borderRadius: "1.5rem", maxWidth: "30rem", padding: "1.5rem" }}>
          <h1>Ocurrió un error inesperado</h1>
          <p>Intenta cargar la aplicación nuevamente.</p>
          <button onClick={reset} type="button">Reintentar</button>
        </main>
      </body>
    </html>
  );
}
