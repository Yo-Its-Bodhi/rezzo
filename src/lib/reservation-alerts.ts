import type { StoredReservation } from "@/lib/restaurant";

export type ReservationAlert = {
  kind: "new" | "edited" | "cancelled";
  reservations: StoredReservation[];
};

export type ReservationSnapshot = {
  ids: Set<string>;
  guestActions: Map<string, string>;
};

export function reservationSnapshot(reservations: StoredReservation[]): ReservationSnapshot {
  return {
    ids: new Set(reservations.map((reservation) => reservation.id)),
    guestActions: new Map(
      reservations
        .filter((reservation) => reservation.guestActionAt)
        .map((reservation) => [reservation.id, reservation.guestActionAt as string]),
    ),
  };
}

export function detectReservationAlert(
  previous: ReservationSnapshot,
  reservations: StoredReservation[],
): ReservationAlert | null {
  const guestChanges = reservations
    .filter(
      (reservation) =>
        previous.ids.has(reservation.id) &&
        reservation.guestAction &&
        reservation.guestActionAt &&
        previous.guestActions.get(reservation.id) !== reservation.guestActionAt,
    )
    .sort((a, b) => (b.guestActionAt ?? "").localeCompare(a.guestActionAt ?? ""));
  const latestGuestChange = guestChanges.at(0);
  if (latestGuestChange?.guestAction) {
    return {
      kind: latestGuestChange.guestAction,
      reservations: guestChanges.filter(
        (reservation) => reservation.guestAction === latestGuestChange.guestAction,
      ),
    };
  }

  const newReservations = reservations.filter((reservation) => !previous.ids.has(reservation.id));
  return newReservations.length > 0 ? { kind: "new", reservations: newReservations } : null;
}
