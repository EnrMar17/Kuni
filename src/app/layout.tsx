import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./clinical-select.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Kuni · Monitoreo clínico",
    template: "%s · Kuni",
  },
  description: "Monitoreo remoto de pacientes crónico-degenerativos.",
  applicationName: "Kuni",
  // Next añade solo el <link rel="manifest"> a partir de src/app/manifest.ts.
  icons: {
    icon: [
      {
        url: "/brand/kuni-mark.png?favicon=5",
        type: "image/png",
      },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Kuni",
    // iOS no lee theme_color del manifiesto; pinta la barra de estado con esto.
    statusBarStyle: "black-translucent",
  },
  // Evita que iOS convierta números en links de teléfono dentro de datos clínicos.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a4470",
  // `viewportFit: cover` deja que el contenido llegue bajo el notch cuando
  // Kuni corre instalada, a pantalla completa (ver `safe-area-inset` en el CSS).
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a className="skip-link" href="#contenido-principal">
          Saltar al contenido principal
        </a>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
