import type { MetadataRoute } from "next";

/**
 * Manifiesto PWA: lo que convierte a Kuni en una app instalable (icono en el
 * escritorio/launcher, ventana propia sin barra de direcciones) sin dejar de
 * ser la misma web. Next lo sirve en /manifest.webmanifest.
 *
 * `display: "standalone"` y no "fullscreen": en una consulta conviene seguir
 * viendo la hora y la batería del dispositivo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kuni · Monitoreo remoto",
    short_name: "Kuni",
    description: "Monitoreo remoto de pacientes crónico-degenerativos.",
    lang: "es-MX",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f7f6",
    theme_color: "#0a4470",
    categories: ["medical", "health", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard" },
      { name: "Pacientes", short_name: "Pacientes", url: "/pacientes" },
    ],
  };
}
