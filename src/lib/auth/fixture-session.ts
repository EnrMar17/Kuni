import "server-only";

import { cookies } from "next/headers";

import { fixtureUnit, getFixtureRoom } from "@/lib/queries/fixtures";

export const FIXTURE_SESSION_COOKIE = "kuni_fixture_session";
export const SELECTED_ROOM_COOKIE = "kuni_selected_room";

export type FixtureSession = {
  userId: string;
  unitId: string;
};

export async function getFixtureSession(): Promise<FixtureSession | null> {
  const value = (await cookies()).get(FIXTURE_SESSION_COOKIE)?.value;

  if (value !== fixtureUnit.id) {
    return null;
  }

  return {
    userId: "fixture-unit-user",
    unitId: fixtureUnit.id,
  };
}

export async function getSelectedFixtureRoom() {
  const session = await getFixtureSession();

  if (!session) {
    return null;
  }

  const roomId = (await cookies()).get(SELECTED_ROOM_COOKIE)?.value;
  const room = roomId ? getFixtureRoom(roomId) : null;

  return room?.unitId === session.unitId ? room : null;
}
