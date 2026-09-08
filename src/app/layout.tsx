import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Kuni",
    template: "%s · Kuni",
  },
  description: "Monitoreo remoto de pacientes crónico-degenerativos.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a className="skip-link" href="#contenido-principal">
          Saltar al contenido principal
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}