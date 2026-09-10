import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantState } from "@/lib/state";

const store = vi.hoisted(() => ({ state: null as RestaurantState | null }));

vi.mock("@/lib/state-store", () => ({
  getRestaurantState: vi.fn(async () => ({ ...store.state, revision: 1 })),
  withLockedRestaurantState: vi.fn(async (mutate: (state: RestaurantState) => unknown) => ({
    result: await mutate(store.state as RestaurantState),
    state: { ...store.state, revision: 2 },
  })),
}));
vi.mock("@/lib/availability", async () => import("../../../../lib/availability"));
vi.mock("@/lib/restaurant", async () => import("../../../../lib/restaurant"));
vi.mock("@/lib/service-slots", async () => import("../../../../lib/service-slots"));
vi.mock("@/lib/booking-pause", async () => import("../../../../lib/booking-pause"));

import { PATCH, POST } from "./route";

function reservation(id: string, tableId: string) {
  return {
    id,
    confirmationCode: `LC-${id.toUpperCase()}`,
    guestName: id,
    email: `${id}@example.com`,
    phone: "416-555-0100",
    partySize: 4,
    startsAt: "2026-08-10T20:00:00.000Z",
    endsAt: "2026-08-10T22:00:00.000Z",
    tableId,
    status: "confirmed" as const,
    source: "online" as const,
    policyVersion: 1,
    policyAcceptedAt: "2026-08-01T00:00:00.000Z",
  };
}

function request(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/reservations/manage", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
  store.state = {
    reservations: [
      reservation("guest", "four"),
      { ...reservation("six-top", "six"), partySize: 6 },
    ],
    waitlist: [],
    operations: {
      onlineBookingPaused: false,
      blockedTableIds: [],
      tableHolds: [],
      fixtures: [],
    },
    tables: [
      { id: "four", name: "4", capacity: 4, x: 0, y: 0, shape: "square", floor: "front", reservable: true },
      { id: "six", name: "6", capacity: 6, x: 0, y: 0, shape: "long", floor: "front", reservable: true },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reservation management API", () => {
  it("finds a booking with either its phone number or email", async () => {
    const phoneResponse = await POST(request("POST", {
      code: "lc-guest",
      contact: "(416) 555-0100",
    }));
    const emailResponse = await POST(request("POST", {
      code: "LC-GUEST",
      contact: "GUEST@EXAMPLE.COM",
    }));

    expect(phoneResponse.status).toBe(200);
    expect(emailResponse.status).toBe(200);
  });

  it("rejects increasing a four-top to six when no six-top is available", async () => {
    const response = await PATCH(request("PATCH", {
      code: "LC-GUEST",
      contact: "guest@example.com",
      action: "edit",
      partySize: 6,
      startsAt: "2026-08-10T20:30:00.000Z",
      request: "",
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/no longer available/i);
    expect(store.state?.reservations[0].partySize).toBe(4);
  });

  it("reassigns a valid edit and records the guest event", async () => {
    const response = await PATCH(request("PATCH", {
      code: "LC-GUEST",
      contact: "4165550100",
      action: "edit",
      partySize: 6,
      startsAt: "2026-08-10T22:00:00.000Z",
      request: "Birthday",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reservation).toMatchObject({
      partySize: 6,
      tableId: "six",
      guestAction: "edited",
      request: "Birthday",
    });
  });

  it("records guest cancellations for staff alerts", async () => {
    const response = await PATCH(request("PATCH", {
      code: "LC-GUEST",
      contact: "guest@example.com",
      action: "cancel",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reservation).toMatchObject({
      status: "cancelled",
      guestAction: "cancelled",
    });
    expect(payload.reservation.guestActionAt).toBeTruthy();
  });
});
