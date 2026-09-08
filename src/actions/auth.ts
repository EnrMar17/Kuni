"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  FIXTURE_SESSION_COOKIE,
  SELECTED_ROOM_COOKIE,
  getFixtureSession,
} from "@/lib/auth/fixture-session";
import { fixtureCredentials, fixtureUnit, getFixtureRoom } from "@/lib/queries/fixtures";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginState = {
  error: string | null;
};

export async function loginWithFixture(
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

  if (
    parsed.data.email.toLowerCase() !== fixtureCredentials.email ||
    parsed.data.password !== fixtureCredentials.password
  ) {
    return { error: "Las credenciales no corresponden a la unidad de demostración." };
  }

  const cookieStore = await cookies();
  cookieStore.set(FIXTURE_SESSION_COOKIE, fixtureUnit.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  cookieStore.delete(SELECTED_ROOM_COOKIE);

  redirect("/consultorios");
}

export async function selectFixtureRoom(formData: FormData) {
  const session = await getFixtureSession();

  if (!session) {
    redirect("/login");
  }

  const roomId = z.uuid().safeParse(formData.get("roomId"));
  const room = roomId.success ? getFixtureRoom(roomId.data) : null;

  if (!room || room.unitId !== session.unitId) {
    redirect("/consultorios?error=consultorio-invalido");
  }

  (await cookies()).set(SELECTED_ROOM_COOKIE, room.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  redirect("/dashboard");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(FIXTURE_SESSION_COOKIE);
  cookieStore.delete(SELECTED_ROOM_COOKIE);
  redirect("/login");
}
