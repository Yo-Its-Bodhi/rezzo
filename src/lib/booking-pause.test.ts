import { describe, expect, it } from "vitest";
import {
  bookingServiceDay,
  isOnlineBookingPausedForDate,
  isOnlineBookingPausedForDay,
} from "./booking-pause";

const pausedToday = {
  onlineBookingPaused: true,
  onlineBookingPausedForDate: "2026-08-08",
};

describe("today-only booking pause", () => {
  it("blocks only the service day selected by staff", () => {
    expect(isOnlineBookingPausedForDay(pausedToday, "2026-08-08")).toBe(true);
    expect(isOnlineBookingPausedForDay(pausedToday, "2026-08-09")).toBe(false);
  });

  it("does not keep a legacy undated pause active forever", () => {
    expect(
      isOnlineBookingPausedForDay(
        { onlineBookingPaused: true, onlineBookingPausedForDate: undefined },
        "2026-08-08",
      ),
    ).toBe(false);
  });

  it("uses Toronto service dates across UTC boundaries", () => {
    const lateToronto = new Date("2026-08-09T02:00:00.000Z");
    expect(bookingServiceDay(lateToronto)).toBe("2026-08-08");
    expect(isOnlineBookingPausedForDate(pausedToday, lateToronto)).toBe(true);
  });
});
