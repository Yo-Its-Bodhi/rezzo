import { describe, expect, it } from "vitest";
import {
  getEligibleTables,
  isTimeAvailable,
  type AvailabilityInput,
} from "./availability";

const tables = [
  { id: "two", name: "T1", capacity: 2 },
  { id: "four", name: "T2", capacity: 4 },
  { id: "six-a", name: "T6", capacity: 6 },
  { id: "six-b", name: "T7", capacity: 6 },
];
const config = {
  durationMinutes: 120,
  startsPerClockHour: 3,
  timezone: "America/Toronto",
};
const at = (hour: number, minute = 0) =>
  new Date(`2026-08-08T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);

const input = (overrides: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  startsAt: at(17),
  partySize: 2,
  tables,
  occupancies: [],
  blocks: [],
  config,
  ...overrides,
});

describe("availability", () => {
  it("assigns the smallest suitable table", () => {
    expect(getEligibleTables(input()).map((table) => table.id)).toEqual([
      "two",
      "four",
      "six-a",
      "six-b",
    ]);
  });

  it("keeps a table occupied for the full two-hour slot", () => {
    const occupancy = {
      tableId: "six-a",
      startsAt: at(17),
      endsAt: at(19),
      status: "confirmed" as const,
    };

    expect(
      getEligibleTables(input({ startsAt: at(18, 30), partySize: 6, occupancies: [occupancy] }))
        .map((table) => table.id),
    ).toEqual(["six-b"]);
    expect(
      getEligibleTables(input({ startsAt: at(19), partySize: 6, occupancies: [occupancy] }))
        .map((table) => table.id),
    ).toEqual(["six-a", "six-b"]);
  });

  it("handles staggered six-top occupancy independently", () => {
    const occupancies = [
      { tableId: "six-a", startsAt: at(17), endsAt: at(19), status: "confirmed" as const },
      { tableId: "six-b", startsAt: at(18), endsAt: at(20), status: "confirmed" as const },
    ];

    expect(isTimeAvailable(input({ startsAt: at(18, 30), partySize: 6, occupancies }))).toBe(false);
    expect(isTimeAvailable(input({ startsAt: at(19), partySize: 6, occupancies }))).toBe(true);
    expect(isTimeAvailable(input({ startsAt: at(20), partySize: 6, occupancies }))).toBe(true);
  });

  it("rejects a fourth start in the same clock hour", () => {
    const occupancies = ["two", "four", "six-a"].map((tableId, index) => ({
      tableId,
      startsAt: at(17, index * 10),
      endsAt: at(19, index * 10),
      status: "confirmed" as const,
    }));

    expect(isTimeAvailable(input({ startsAt: at(17, 45), occupancies }))).toBe(false);
    expect(isTimeAvailable(input({ startsAt: at(19), occupancies }))).toBe(true);
  });

  it("honours staff table blocks", () => {
    expect(
      isTimeAvailable(
        input({
          partySize: 6,
          blocks: [
            { tableId: "six-a", startsAt: at(16), endsAt: at(20) },
            { tableId: "six-b", startsAt: at(16), endsAt: at(20) },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("limits tables during happy hour", () => {
    expect(
      getEligibleTables(
        input({
          partySize: 2,
          happyHourRules: [
            {
              startsAt: at(16),
              endsAt: at(19),
              minTableCapacity: 1,
              maxTableCapacity: 4,
            },
          ],
        }),
      ).map((table) => table.id),
    ).toEqual(["two", "four"]);
  });
});
