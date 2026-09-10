import { describe, expect, it } from "vitest";
import { DEFAULT_TABLES, type StoredReservation } from "./restaurant";
import {
  staffBookingRuleExceptions,
  staffReservationEditRuleExceptions,
} from "./staff-booking";

function reservation(id: string, startsAt: string, tableId: string): StoredReservation {
  return {
    id,
    confirmationCode: `LC-${id}`,
    guestName: id,
    email: `${id}@example.com`,
    phone: "4165550100",
    partySize: 2,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 120 * 60_000).toISOString(),
    tableId,
    status: "confirmed",
    source: "staff",
    policyVersion: 1,
    policyAcceptedAt: startsAt,
  };
}

describe("staffBookingRuleExceptions", () => {
  it("reports every bypassed safety rule", () => {
    const startsAt = new Date("2026-08-08T22:00:00.000Z");
    const reservations = [
      reservation("one", "2026-08-08T22:00:00.000Z", "t11"),
      reservation("two", "2026-08-08T22:15:00.000Z", "t12"),
      reservation("three", "2026-08-08T22:30:00.000Z", "t13"),
    ];
    expect(
      staffBookingRuleExceptions({
        startsAt,
        partySize: 8,
        tableId: "t11",
        tables: DEFAULT_TABLES,
        reservations,
      }),
    ).toEqual([
      "party exceeds the normal six-person maximum",
      "party exceeds table 11's capacity",
      "table 11 already has an overlapping booking",
      "clock hour already has three reservation starts",
    ]);
  });

  describe("staffReservationEditRuleExceptions", () => {
    it("allows harmless details edits without re-requesting an override", () => {
      const original = reservation("guest", "2026-08-10T20:00:00.000Z", "t11");

      expect(
        staffReservationEditRuleExceptions({
          original,
          startsAt: new Date(original.startsAt),
          partySize: original.partySize,
          tableIds: ["t11"],
          tables: DEFAULT_TABLES,
          reservations: [],
        }),
      ).toEqual([]);
    });

    it("allows a valid single-table reassignment without an override", () => {
      const original = reservation("guest", "2026-08-10T20:00:00.000Z", "t11");

      expect(
        staffReservationEditRuleExceptions({
          original,
          startsAt: new Date(original.startsAt),
          partySize: original.partySize,
          tableIds: ["t13"],
          tables: DEFAULT_TABLES,
          reservations: [],
        }),
      ).toEqual([]);
    });

    it("does not re-request an override for a grandfathered oversized party", () => {
      const original = reservation("large", "2026-08-10T20:00:00.000Z", "t12");
      original.partySize = 8;
      original.overrideReason = "Approved large party";

      expect(
        staffReservationEditRuleExceptions({
          original,
          startsAt: new Date(original.startsAt),
          partySize: 8,
          tableIds: ["t12"],
          tables: DEFAULT_TABLES,
          reservations: [],
        }),
      ).toEqual([]);
    });

    it("requires an override when an edit introduces a rule violation", () => {
      const original = reservation("guest", "2026-08-10T20:00:00.000Z", "t11");

      expect(
        staffReservationEditRuleExceptions({
          original,
          startsAt: new Date(original.startsAt),
          partySize: 8,
          tableIds: ["t11", "t12"],
          tables: DEFAULT_TABLES,
          reservations: [],
        }),
      ).toEqual([
        "party exceeds the normal six-person maximum",
        "reservation uses multiple tables",
      ]);
    });
  });

  it("requires an exception for an unassigned booking", () => {
    expect(
      staffBookingRuleExceptions({
        startsAt: new Date("2026-08-10T20:00:00.000Z"),
        partySize: 4,
        tableId: "",
        tables: DEFAULT_TABLES,
        reservations: [],
      }),
    ).toContain("reservation has no table assignment");
  });

  it("counts completed turns toward the hourly start limit without blocking their table", () => {
    const completed = reservation("completed", "2026-08-08T22:00:00.000Z", "t11");
    completed.status = "completed";
    const reservations = [
      completed,
      reservation("two", "2026-08-08T22:15:00.000Z", "t12"),
      reservation("three", "2026-08-08T22:30:00.000Z", "t13"),
    ];

    const exceptions = staffBookingRuleExceptions({
      startsAt: new Date("2026-08-08T22:45:00.000Z"),
      partySize: 2,
      tableId: "t11",
      tables: DEFAULT_TABLES,
      reservations,
    });

    expect(exceptions).toContain("clock hour already has three reservation starts");
    expect(exceptions).not.toContain("table 11 already has an overlapping booking");
  });

  it("detects overlap on every table assigned to a large party", () => {
    const largeParty = reservation("large", "2026-08-10T22:00:00.000Z", "t11");
    largeParty.partySize = 8;
    largeParty.tableIds = ["t11", "t12"];

    expect(
      staffBookingRuleExceptions({
        startsAt: new Date("2026-08-10T22:30:00.000Z"),
        partySize: 2,
        tableId: "t12",
        tables: DEFAULT_TABLES,
        reservations: [largeParty],
      }),
    ).toContain("table 12 already has an overlapping booking");
  });
});
