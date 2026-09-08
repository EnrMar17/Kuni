import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/contracts/errors";

/** Cookie de preferencia de consultorio. Nunca es prueba de autoridad por sí
 * sola: siempre se revalida contra la unidad real del usuario abajo. */
export const CONSULTING_ROOM_COOKIE = "kuni_consulting_room_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda la preferencia de consultorio. Úsala SOLO desde un Server Action o
 * Route Handler (cookies().set no funciona desde un Server Component).
 * httpOnly + secure + sameSite=lax: no hace falta que JavaScript del
 * navegador la lea, así que se cierra esa superficie (mitiga robo por XSS).
 */
export async function setConsultingRoomCookie(roomId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CONSULTING_ROOM_COOKIE, roomId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
}

export async function clearConsultingRoomCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(CONSULTING_ROOM_COOKIE);
}

// El check constraint de unit_memberships.role no se refleja como literal
// union en los tipos generados (Supabase solo tipa enums nativos de
// Postgres, no `check (col in (...))`), así que se declara a mano aquí.
export type MembershipRole = "shared_clinician" | "clinician" | "viewer";

export type AuthContext = {
  userId: string;
  email: string | null;
  unitId: string;
  unitName: string;
  timezone: string;
  role: MembershipRole;
  consultingRoom: { id: string; name: string; doctorId: string } | null;
};

/**
 * Verifica JWT + membresía activa en la unidad, en CADA llamada. Esta es la
 * autorización real — src/proxy.ts es solo una primera barrera de red, no
 * sustituye esta verificación (el plan lo dice explícito: "el proxy no es
 * toda la autorización").
 *
 * Debe invocarse al inicio de todo Server Action / Route Handler / layout
 * protegido que toque datos clínicos. `unit_id` sale de aquí, nunca de un
 * campo de formulario o de la cookie de consultorio.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    throw new AppError("UNAUTHENTICATED", "Sesión inválida o expirada.");
  }

  const claims = claimsData.claims as { sub: string; email?: string };
  const userId = claims.sub;

  const { data: membership, error: membershipError } = await supabase
    .from("unit_memberships")
    .select("unit_id, role, active, health_units(id, name, timezone, active)")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError) {
    console.error("[kuni] error verificando membresía:", membershipError);
    throw new AppError("INTERNAL", "No se pudo verificar tu membresía.");
  }

  const unit = membership?.health_units ?? null;
  if (!membership || !unit || !unit.active) {
    throw new AppError(
      "FORBIDDEN",
      "No perteneces a ninguna unidad de salud activa."
    );
  }

  const consultingRoom = await getValidatedConsultingRoom(supabase, unit.id);

  return {
    userId,
    email: claims.email ?? null,
    unitId: unit.id,
    unitName: unit.name,
    timezone: unit.timezone,
    role: membership.role as MembershipRole,
    consultingRoom,
  };
}

async function getValidatedConsultingRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<AuthContext["consultingRoom"]> {
  const cookieStore = await cookies();
  const roomId = cookieStore.get(CONSULTING_ROOM_COOKIE)?.value;
  // Valida formato antes de tocar la base — una cookie manipulada con
  // basura no debe ni siquiera generar una consulta (defensa en profundidad;
  // la query ya es parametrizada, así que no hay inyección posible, pero
  // tampoco hay razón para dejar pasar algo que no es un UUID).
  if (!roomId || !UUID_RE.test(roomId)) return null;

  // La cookie es preferencia, no autoridad: se revalida que el consultorio
  // pertenezca a ESTA unidad y siga activo. Si no valida, se ignora en
  // silencio — no se lanza error aquí; el caller decide (normalmente
  // redirigir a /consultorios).
  const { data: room } = await supabase
    .from("consulting_rooms")
    .select("id, name, doctor_id")
    .eq("unit_id", unitId)
    .eq("id", roomId)
    .eq("active", true)
    .maybeSingle();

  if (!room) return null;
  return { id: room.id, name: room.name, doctorId: room.doctor_id };
}

/**
 * Igual que getAuthContext, pero además exige que ya haya un consultorio
 * válido seleccionado. Úsalo en acciones que operan sobre un consultorio
 * concreto (altas de paciente, recetas, citas...).
 */
export async function requireConsultingRoom(): Promise<
  AuthContext & { consultingRoom: NonNullable<AuthContext["consultingRoom"]> }
> {
  const ctx = await getAuthContext();
  if (!ctx.consultingRoom) {
    throw new AppError("VALIDATION", "Selecciona un consultorio antes de continuar.");
  }
  return ctx as AuthContext & { consultingRoom: NonNullable<AuthContext["consultingRoom"]> };
}
