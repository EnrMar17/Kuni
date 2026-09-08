import { safeRedirectPath } from "@/lib/utils/safe-redirect";

/** Destinos después del login: locales y fuera de las rutas de autenticación. */
export function postLoginRedirect(candidate: string | null | undefined) {
  const path = safeRedirectPath(candidate);
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return "/dashboard";
  const destination = new URL(path, "https://kuni.invalid");
  if (
    destination.origin !== "https://kuni.invalid" ||
    destination.pathname === "/" ||
    /^\/(login|api)(\/|$)/.test(destination.pathname)
  ) return "/dashboard";
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export const loginErrors: Record<string, string> = {
  "sesion-vencida": "Tu sesión venció. Inicia sesión nuevamente.",
  "sin-membresia": "Tu cuenta no pertenece a una unidad activa. Contacta a quien administra los accesos.",
  conexion: "No pudimos verificar tu acceso. Intenta nuevamente.",
  "salida-fallida": "No se pudo cerrar la sesión. Intenta cerrar sesión nuevamente.",
};
