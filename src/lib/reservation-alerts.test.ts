import { describe, expect, it } from "vitest";
import type { StoredReservation } from "./restaurant";
import { detectReservationAlert, reservationSnapshot } from "./reservation-alerts";

function reservation(id: string): StoredReservation {
  return {
    id,
    confirmationCode: `LC-${id}`,
    guestName: id,
    email: `${id}@example.com`,
    phone: "4165550100",
    partySize: 2,
    startsAt: "2026-08-10T22:00:00.000Z",
    endsAt: "2026-08-11T00:00:00.000Z",
    tableId: "t11",
    status: "confirmed",
    source: "online",
    policyVersion: 1,
    policyAcceptedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("reservation alerts", () => {
  it("classifies newly created reservations", () => {
    const existing = reservation("existing");
    const created = reservation("created");

    expect(detectReservationAlert(reservationSnapshot([existing]), [existing, created])).toEqual({
      kind: "new",
      reservations: [created],
    });
  });

  it.each(["edited", "cancelled"] as const)("classifies guest %s events", (kind) => {
    const before = reservation("guest");
    const after = {
      ...before,
      guestAction: kind,
      guestActionAt: "2026-08-08T18:40:00.000Z",
    };

    expect(detectReservationAlert(reservationSnapshot([before]), [after])).toEqual({
      kind,
      reservations: [after],
    });
  });

  it("does not repeat an event already in the snapshot", () => {
    const changed = {
      ...reservation("guest"),
      guestAction: "edited" as const,
      guestActionAt: "2026-08-08T18:40:00.000Z",
    };

    expect(detectReservationAlert(reservationSnapshot([changed]), [changed])).toBeNull();
  });
});
