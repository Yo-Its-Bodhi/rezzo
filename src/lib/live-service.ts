import type { StoredReservation } from "./restaurant";

export function upcomingArrivals(
  reservations: StoredReservation[],
  now: Date,
  dayKey: (date: Date) => string,
) {
  const latestArrival = now.getTime() + 90 * 60_000;

  return reservations
    .filter(
      (reservation) =>
        !reservation.archivedAt &&
        reservation.source !== "walkin" &&
        dayKey(new Date(reservation.startsAt)) === dayKey(now) &&
        ["confirmed", "arrived"].includes(reservation.status) &&
        new Date(reservation.startsAt).getTime() < latestArrival,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function liveTableTurns(reservations: StoredReservation[], now: Date) {
  return reservations
    .filter(
      (reservation) =>
        !reservation.archivedAt &&
        reservation.status === "seated" &&
        new Date(reservation.startsAt) <= now,
    )
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}

export function minutesUntilTurnEnds(reservation: StoredReservation, now: Date) {
  return Math.ceil((new Date(reservation.endsAt).getTime() - now.getTime()) / 60_000);
}

export function turnCountdownLabel(minutesRemaining: number) {
  if (minutesRemaining <= 0) return `${Math.abs(minutesRemaining)} MIN OVER`;
  if (minutesRemaining < 60) return `${minutesRemaining} MIN LEFT`;

  const hours = Math.floor(minutesRemaining / 60);
  const minutes = minutesRemaining % 60;
  return `${hours}H${minutes ? ` ${minutes}M` : ""} LEFT`;
}

export function reservationOccupiesTableAt(
  reservation: StoredReservation,
  at: Date,
) {
  if (
    reservation.archivedAt ||
    ["cancelled", "completed", "no_show"].includes(reservation.status)
  ) {
    return false;
  }

  const startsAt = new Date(reservation.startsAt);
  if (reservation.status === "seated") return true;
  if (startsAt > at) return false;
  return new Date(reservation.endsAt) > at;
}

export function reservationConflictsWithTurn(
  reservation: StoredReservation,
  startsAt: Date,
  endsAt: Date,
) {
  if (
    reservation.archivedAt ||
    ["cancelled", "completed", "no_show"].includes(reservation.status)
  ) {
    return false;
  }

  const reservationStart = new Date(reservation.startsAt);
  if (reservation.status === "seated") return reservationStart < endsAt;
  return reservationStart < endsAt && new Date(reservation.endsAt) > startsAt;
}
