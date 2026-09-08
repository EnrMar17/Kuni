"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AppError } from "@/contracts/errors";
import {
  clearConsultingRoomCookie,
  findActiveConsultingRoom,
  getAuthContext,
  setConsultingRoomCookie,
} from "@/lib/auth/context";
import { postLoginRedirect } from "@/lib/auth/navigation";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export type LoginState = {
  error: string | null;
};

async function clearLegacySessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete("kuni_fixture_session");
  cookieStore.delete("kuni_selected_room");
}

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Escribe un correo válido y tu contraseña." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      // 429: límite de intentos de login por IP (auth.rate_limit.sign_in_sign_ups
      // en supabase/config.toml, endurecido a propósito). Distinguirlo del caso
      // de credenciales incorrectas evita que alguien reintente contraseñas a
      // ciegas creyendo que escribió mal, cuando el problema es el límite.
      return { error: error.status === 400 || error.status === 401
        ? "El correo o la contraseña no son correctos."
        : error.status === 429
          ? "Demasiados intentos. Espera unos minutos antes de volver a intentar."
          : "No pudimos iniciar sesión. Intenta nuevamente." };
    }
    await clearConsultingRoomCookie();
    await clearLegacySessionCookies();
    await getAuthContext();
  } catch (error) {
    return { error: error instanceof AppError && error.code === "FORBIDDEN"
      ? error.message
      : "No pudimos verificar tu acceso. Intenta nuevamente." };
  }

  const destination = postLoginRedirect(String(formData.get("redirectTo") ?? ""));
  redirect(`/consultorios?redirectTo=${encodeURIComponent(destination)}`);
}

export async function selectConsultingRoom(formData: FormData) {
  const parsed = z.uuid().safeParse(formData.get("roomId"));
  let failure: string | null = null;
  try {
    const context = await getAuthContext();
    const room = parsed.success ? await findActiveConsultingRoom(context, parsed.data) : null;
    if (!room) {
      failure = "/consultorios?error=consultorio-invalido";
    } else {
      // Cambia el contexto de lectura, no datos clínicos; viewer también puede elegirlo.
      await setConsultingRoomCookie(room.id);
    }
  } catch (error) {
    failure = error instanceof AppError && error.code === "UNAUTHENTICATED"
      ? "/login?error=sesion-vencida"
      : error instanceof AppError && error.code === "FORBIDDEN"
        ? "/login?error=sin-membresia"
        : "/consultorios?error=conexion";
  }
  if (failure) redirect(failure);
  const destination = postLoginRedirect(String(formData.get("redirectTo") ?? ""));
  redirect(destination === "/consultorios" || destination.startsWith("/consultorios?")
    ? "/dashboard" : destination);
}

export async function logout() {
  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  await clearConsultingRoomCookie();
  await clearLegacySessionCookies();
  redirect(failed ? "/login?error=salida-fallida" : "/login");
}
