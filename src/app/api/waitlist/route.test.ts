import { createECDH, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantState, VersionedRestaurantState } from "../../../lib/state";

const memory = vi.hoisted(() => ({
  state: null as VersionedRestaurantState | null, locked: false, authorized: true, enabled: true,
  send: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => { throw new Error("Never access live data in tests."); } }));
vi.mock("@/lib/restaurant", async () => import("../../../lib/restaurant"));
vi.mock("@/lib/state", async () => import("../../../lib/state"));
vi.mock("@/lib/waitlist-engine", async () => import("../../../lib/waitlist-engine"));
vi.mock("@/lib/waitlist-api", async () => import("../../../lib/waitlist-api"));
vi.mock("../../../lib/features", () => ({ get WAITLIST_ENABLED() { return memory.enabled; } }));
vi.mock("@/lib/features", () => ({ get WAITLIST_ENABLED() { return memory.enabled; } }));
vi.mock("@/lib/staff-guard", () => ({
  requireStaff: async () => memory.authorized ? null : Response.json({ error: "Staff authentication required." }, { status: 401 }),
}));
vi.mock("@/lib/demo", () => ({
  isDemoMode: () => true,
  getDemoRestaurantState: () => structuredClone(memory.state),
  updateDemoRestaurantState: (state: RestaurantState) => {
    memory.state = { ...structuredClone(state), revision: (memory.state?.revision ?? 0) + 1 };
    return structuredClone(memory.state);
  },
}));
vi.mock("@/lib/state-store", async () => {
  const real = await import("../../../lib/state-store");
  return {
    ...real,
    withLockedRestaurantState: async (...args: Parameters<typeof real.withLockedRestaurantState>) => {
      memory.locked = true;
      try { return await real.withLockedRestaurantState(...args); } finally { memory.locked = false; }
    },
  };
});
vi.mock("@/lib/waitlist-push", async () => ({
  ...(await import("../../../lib/waitlist-push")),
  sendWaitlistPush: memory.send,
}));

import { defaultRestaurantState } from "../../../lib/state";
import { OFFER_MS } from "../../../lib/waitlist-engine";
import { GET, POST } from "./route";
import { POST as respond } from "./respond/route";
import { POST as subscribe } from "./subscribe/route";
import { GET as config } from "./config/route";
import { POST as staff } from "../staff/waitlist/route";
import { POST as retired } from "../notifications/waitlist-offer/route";
import { GET as staffState, PUT as putState } from "../staff/state/route";

const now = new Date("2026-09-06T20:00:00Z");
const form = { guestName: "Guest", phone: "4165550100", partySize: 4, consent: true };
function request(body?: unknown, token?: string, method = body === undefined ? "GET" : "POST") {
  return new Request("https://untrusted-request.example/api/waitlist", {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function join() {
  const response = await POST(request(form));
  expect(response.status).toBe(200);
  return response.json() as Promise<{ token: string; ticket: { id: string; status: string; offerId?: string } }>;
}
function subscription() {
  const key = createECDH("prime256v1");
  key.generateKeys();
  return { endpoint: "https://web.push.apple.com/test", keys: {
    p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"),
  } };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SESSION_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  vi.stubEnv("APP_URL", "https://restaurant.example");
  const vapid = createECDH("prime256v1");
  vapid.generateKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.getPublicKey().toString("base64url"));
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.getPrivateKey().toString("base64url"));
  vi.stubEnv("VAPID_SUBJECT", "mailto:host@restaurant.example");
  memory.state = { ...defaultRestaurantState(), revision: 1 };
  memory.authorized = true;
  memory.enabled = true;
  memory.locked = false;
  memory.send.mockReset().mockImplementation(async () => {
    expect(memory.locked).toBe(false);
    expect(memory.state?.waitlist[0].status).toBe("offered");
    return { delivery: { channel: "push", sent: false, error: "No push subscription." }, invalidate: false };
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("waitlist HTTP contract", () => {
  it("joins privately, authenticates bearer-only polling, and does not expose another phone ticket", async () => {
    const first = await join();
    const response = await GET(request(undefined, first.token));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ticket: { id: first.ticket.id, position: 1, aheadCount: 0 } });
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request(undefined, "forged"))).status).toBe(401);
    const duplicate = await POST(request(form));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).not.toHaveProperty("token");
    const ownRetry = await POST(request(form, first.token));
    expect((await ownRetry.json()).token).toBe(first.token);
    expect(memory.state?.waitlist).toHaveLength(1);
  });
  it.each([
    { ...form, partySize: 7 }, { ...form, phone: "abc123" }, { ...form, consent: false }, { ...form, guestName: " " },
  ])("rejects invalid join data", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(Object.keys(await response.json())).toEqual(["error"]);
  });
  it("requires staff auth for actions and state", async () => {
    const first = await join();
    memory.authorized = false;
    expect((await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }))).status).toBe(401);
    expect((await staffState()).status).toBe(401);
    expect(memory.state?.waitlist[0].status).toBe("waiting");
  });
  it("persists a real offer despite delivery failure, sends outside the lock, and returns current safe state", async () => {
    const first = await join();
    const response = await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.delivery).toEqual([{ channel: "push", sent: false, error: "No push subscription." }]);
    expect(result.state.waitlist[0]).toMatchObject({ status: "offered" });
    expect(result.state.operations.tableHolds).toHaveLength(1);
    for (const key of ["tokenHash", "credentialNonce", "pushSubscription"]) {
      expect(result.state.waitlist[0]).not.toHaveProperty(key);
      expect((await (await staffState()).json()).waitlist[0]).not.toHaveProperty(key);
    }
    const guest = await (await GET(request(undefined, first.token))).json();
    expect(guest.ticket).toMatchObject({ offerId: expect.any(String), status: "offered", tableName: "11" });
    expect(guest.ticket).not.toHaveProperty("phone");
    expect(memory.send).toHaveBeenCalledTimes(1);
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    expect(memory.send).toHaveBeenCalledTimes(1);
  });
  it("accepts with the matching offer id, repeats idempotently, and seats through staff action", async () => {
    const first = await join();
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    const offerId = memory.state!.waitlist[0].offerId;
    expect((await respond(request({ action: "accept" }, first.token))).status).toBe(409);
    const accepted = await respond(request({ action: "accept", offerId }, first.token));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).ticket).toMatchObject({ status: "accepted", reservationCode: expect.any(String), arrivalDeadline: expect.any(String) });
    expect((await respond(request({ action: "accept", offerId }, first.token))).status).toBe(200);
    expect(memory.state?.reservations).toHaveLength(1);
    expect((await staff(request({ entryId: first.ticket.id, action: "seat" }))).status).toBe(200);
    expect(memory.state?.reservations[0].status).toBe("seated");
  });
  it("lazy polling releases an expired hold and stale responses cannot recreate it", async () => {
    const first = await join();
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    const offerId = memory.state!.waitlist[0].offerId;
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    const expired = await GET(request(undefined, first.token));
    expect((await expired.json()).ticket.status).toBe("expired");
    expect(memory.state?.operations.tableHolds).toHaveLength(0);
    expect((await respond(request({ action: "accept", offerId }, first.token))).status).toBe(409);
  });
  it("supports the guest's accepted-ticket leave button and cancels its reservation", async () => {
    const first = await join();
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    const offerId = memory.state!.waitlist[0].offerId;
    await respond(request({ action: "accept", offerId }, first.token));
    const left = await respond(request({ action: "leave", offerId }, first.token));
    expect(left.status).toBe(200);
    expect((await left.json()).ticket.status).toBe("removed");
    expect(memory.state?.reservations[0].status).toBe("cancelled");
  });
  it("saves only validated push subscriptions and removes invalidated ones after delivery", async () => {
    const first = await join();
    expect((await subscribe(request({ subscription: { ...subscription(), endpoint: "https://localhost/private" } }, first.token))).status).toBe(400);
    expect((await subscribe(request({ subscription: subscription() }))).status).toBe(401);
    const subscribed = await subscribe(request({ subscription: subscription() }, first.token));
    expect(subscribed.status).toBe(200);
    expect((await subscribed.json()).ticket.pushEnabled).toBe(true);
    const staffView = await (await staffState()).json();
    expect(staffView.waitlist[0].pushEnabled).toBe(true);
    expect(staffView.waitlist[0]).not.toHaveProperty("pushSubscription");
    memory.send.mockResolvedValue({ delivery: { channel: "push", sent: false, error: "Expired." }, invalidate: true });
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    expect(memory.state?.waitlist[0].pushSubscription).toBeUndefined();
  });
  it("keeps a newer subscription when an older in-flight delivery fails", async () => {
    const first = await join();
    await subscribe(request({ subscription: subscription() }, first.token));
    const replacement = subscription();
    memory.send.mockImplementation(async () => {
      await subscribe(request({ subscription: replacement }, first.token));
      return { delivery: { channel: "push", sent: false, error: "Expired." }, invalidate: true };
    });
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    expect(memory.state?.waitlist[0].pushSubscription).toEqual(replacement);
  });
  it("prevents general staff PUT from deleting offer protection or installing a competing booking", async () => {
    const first = await join();
    await staff(request({ entryId: first.ticket.id, action: "offer", tableId: "t11" }));
    const current = structuredClone(memory.state!);
    const stripped = { ...current, waitlist: [], operations: { ...current.operations, tableHolds: [] } };
    const response = await putState(request({ revision: current.revision, state: stripped }, undefined, "PUT"));
    expect(response.status).toBe(200);
    expect(memory.state?.operations.tableHolds).toHaveLength(1);
    expect(memory.state?.waitlist).toHaveLength(1);
  });
  it("returns only the public push key and respects feature gating everywhere", async () => {
    const result = await (await config()).json();
    expect(result).toEqual({ enabled: true, pushPublicKey: process.env.VAPID_PUBLIC_KEY });
    expect(JSON.stringify(result)).not.toContain(process.env.VAPID_PRIVATE_KEY);
    memory.enabled = false;
    expect(await (await config()).json()).toEqual({ enabled: false, pushPublicKey: null });
    expect((await POST(request(form))).status).toBe(503);
    expect((await GET(request())).status).toBe(503);
    expect((await staff(request({ action: "offer", entryId: "any", tableId: "t11" }))).status).toBe(503);
  });
  it("retires the old unprotected notification endpoint without delivering", async () => {
    expect((await retired()).status).toBe(410);
    expect(memory.send).not.toHaveBeenCalled();
  });
});
