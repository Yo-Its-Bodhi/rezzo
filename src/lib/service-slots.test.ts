import { describe, expect, it } from "vitest";
import { serviceSlots } from "./service-slots";

describe("serviceSlots", () => {
  it("uses the revised Monday reservation hours", () => {
    const slots = serviceSlots("2026-04-06");
    expect(slots).toHaveLength(21);
    expect(slots[0].toISOString()).toBe("2026-04-06T20:00:00.000Z");
    expect(slots.at(-1)?.toISOString()).toBe("2026-04-07T01:00:00.000Z");
  });

  it("offers Sunday reservations through 8 PM", () => {
    const slots = serviceSlots("2026-04-05");
    expect(slots).toHaveLength(33);
    expect(slots.at(-1)?.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });

  it("offers Thursday through Saturday reservations through 10 PM", () => {
    const slots = serviceSlots("2026-04-09");
    expect(slots).toHaveLength(41);
    expect(slots.at(-1)?.toISOString()).toBe("2026-04-10T02:00:00.000Z");
  });

  it("observes Toronto daylight-saving time", () => {
    expect(serviceSlots("2026-01-12")[0].toISOString()).toBe("2026-01-12T21:00:00.000Z");
    expect(serviceSlots("2026-07-13")[0].toISOString()).toBe("2026-07-13T20:00:00.000Z");
  });
});
