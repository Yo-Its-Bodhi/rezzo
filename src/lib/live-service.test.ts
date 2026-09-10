import { describe, expect, it } from "vitest";
import type { StoredReservation } from "./restaurant";
import {
  liveTableTurns,
  minutesUntilTurnEnds,
  reservationConflictsWithTurn,
  reservationOccupiesTableAt,
  turnCountdownLabel,
  upcomingArrivals,
} from "./live-service";

function reservation(
  id: string,
  startsAt: string,
  status: StoredReservation["status"],
  source: StoredReservation["source"] = "online",
): StoredReservation {
  return {
    id,
    confirmationCode: id,
    guestName: id,
    phone: "",
    email: "",
    partySize: 2,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 2 * 60 * 60_000).toISOString(),
    tableId: "t1",
    status,
    source,
    policyVersion: 1,
    policyAcceptedAt: startsAt,
  };
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

describe("live service queues", () => {
  const now = new Date("2026-08-08T21:00:00.000Z");

  it("never presents seated, completed, or walk-in records as upcoming arrivals", () => {
    const reservations = [
      reservation("confirmed", "2026-08-08T20:30:00.000Z", "confirmed"),
      reservation("seated", "2026-08-08T20:45:00.000Z", "seated"),
      reservation("completed", "2026-08-08T20:40:00.000Z", "completed"),
      reservation("walkin", "2026-08-08T20:50:00.000Z", "confirmed", "walkin"),
    ];

    expect(upcomingArrivals(reservations, now, dayKey).map((item) => item.id)).toEqual([
      "confirmed",
    ]);
  });

  it("orders live seated turns by the table due to finish first", () => {
    const later = reservation("later", "2026-08-08T20:30:00.000Z", "seated");
    const sooner = reservation("sooner", "2026-08-08T19:30:00.000Z", "seated");
    const completed = reservation("completed", "2026-08-08T19:00:00.000Z", "completed");

    expect(liveTableTurns([later, completed, sooner], now).map((item) => item.id)).toEqual([
      "sooner",
      "later",
    ]);
  });

  it("formats full, final-hour, and overdue countdowns", () => {
    const active = reservation("active", "2026-08-08T20:00:00.000Z", "seated");

    expect(minutesUntilTurnEnds(active, now)).toBe(60);
    expect(turnCountdownLabel(107)).toBe("1H 47M LEFT");
    expect(turnCountdownLabel(30)).toBe("30 MIN LEFT");
    expect(turnCountdownLabel(-8)).toBe("8 MIN OVER");
  });

  it("keeps an overdue seated party occupying its table until completion", () => {
    const seated = reservation("seated", "2026-08-08T18:00:00.000Z", "seated");
    expect(reservationOccupiesTableAt(seated, new Date("2026-08-08T21:00:00.000Z"))).toBe(true);
    expect(
      reservationConflictsWithTurn(
        seated,
        new Date("2026-08-08T21:00:00.000Z"),
        new Date("2026-08-08T23:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("treats an early-seated party as occupying immediately", () => {
    const seatedEarly = reservation("early", "2026-08-08T22:00:00.000Z", "seated");
    expect(
      reservationOccupiesTableAt(seatedEarly, new Date("2026-08-08T21:30:00.000Z")),
    ).toBe(true);
  });

  it("releases completed parties but keeps prior-day seated parties occupied", () => {
    const completed = reservation("done", "2026-08-08T18:00:00.000Z", "completed");
    const priorDay = reservation("prior", "2026-08-07T18:00:00.000Z", "seated");
    const now = new Date("2026-08-08T21:00:00.000Z");

    expect(reservationOccupiesTableAt(completed, now)).toBe(false);
    expect(reservationOccupiesTableAt(priorDay, now)).toBe(true);
  });
});
