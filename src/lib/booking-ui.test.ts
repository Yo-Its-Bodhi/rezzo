import { describe, expect, it } from "vitest";
import { restaurantDate } from "./booking-ui";

describe("reservation calendar uses Toronto dates", () => {
  it("keeps the restaurant's date when UTC has already rolled into tomorrow", () => {
    const now = new Date("2026-10-15T02:30:00Z");
    expect(restaurantDate(0, now)).toBe("2026-10-14");
    expect(restaurantDate(1, now)).toBe("2026-10-15");
    expect(restaurantDate(60, now)).toBe("2026-12-13");
  });

  it("advances calendar days across daylight-saving boundaries", () => {
    expect(restaurantDate(1, new Date("2026-03-08T04:30:00Z"))).toBe(
      "2026-03-08",
    );
    expect(restaurantDate(2, new Date("2026-03-08T04:30:00Z"))).toBe(
      "2026-03-09",
    );
    expect(restaurantDate(1, new Date("2026-11-01T04:30:00Z"))).toBe(
      "2026-11-02",
    );
  });

  it("handles year and leap-day rollovers without local timezone parsing", () => {
    expect(restaurantDate(1, new Date("2026-12-31T18:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(restaurantDate(1, new Date("2028-02-28T18:00:00Z"))).toBe(
      "2028-02-29",
    );
    expect(restaurantDate(2, new Date("2028-02-28T18:00:00Z"))).toBe(
      "2028-03-01",
    );
  });
});
