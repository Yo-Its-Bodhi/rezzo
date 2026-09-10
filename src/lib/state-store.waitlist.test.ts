import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantState, VersionedRestaurantState } from "./state";

const memory = vi.hoisted(() => ({ state: null as VersionedRestaurantState | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => { throw new Error("Tests must never contact a live database."); } }));
vi.mock("@/lib/restaurant", async () => import("./restaurant"));
vi.mock("@/lib/state", async () => import("./state"));
vi.mock("@/lib/waitlist-engine", async () => import("./waitlist-engine"));
vi.mock("@/lib/demo", () => ({
  isDemoMode: () => true,
  getDemoRestaurantState: () => structuredClone(memory.state),
  updateDemoRestaurantState: (state: RestaurantState) => {
    memory.state = { ...structuredClone(state), revision: (memory.state?.revision ?? 0) + 1 };
    return structuredClone(memory.state);
  },
}));
import { defaultRestaurantState } from "./state";
import { getRestaurantState, replaceRestaurantState, withLockedRestaurantState } from "./state-store";
import { OFFER_MS, joinWaitlist, respondToWaitlist, staffWaitlistAction, waitlistJoinSchema } from "./waitlist-engine";

const now = new Date("2026-09-06T20:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SESSION_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  memory.state = { ...defaultRestaurantState(), revision: 1 };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function addOffer() {
  return withLockedRestaurantState((state) => {
    const { entry } = joinWaitlist(state, waitlistJoinSchema.parse({
      guestName: "Guest", phone: "4165550100", partySize: 2, consent: true,
    }));
    staffWaitlistAction(state, entry.id, "offer", "t11");
    return entry.id;
  });
}

describe("state store lazy waitlist expiry", () => {
  it("read-only polling expires holds and increments revision exactly once", async () => {
    const offered = await addOffer();
    const fresh = await getRestaurantState();
    expect(fresh.revision).toBe(offered.state.revision);
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    const expired = await getRestaurantState();
    expect(expired.waitlist[0].status).toBe("expired");
    expect(expired.operations.tableHolds).toHaveLength(0);
    expect(expired.revision).toBe(offered.state.revision + 1);
    expect((await getRestaurantState()).revision).toBe(expired.revision);
  });
  it("expires before booking mutations and persists expiry despite shouldPersist=false", async () => {
    const offered = await addOffer();
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    const result = await withLockedRestaurantState((state) => {
      expect(state.operations.tableHolds).toHaveLength(0);
      state.operations.blockedTableIds.push("t12");
      return false;
    }, Boolean);
    expect(result.state.revision).toBe(offered.state.revision + 1);
    expect(result.state.operations.blockedTableIds).toEqual([]);
    expect(memory.state?.waitlist[0].status).toBe("expired");
  });
  it("persists expiry but rolls back a failed mutation, including exact-deadline accept", async () => {
    await addOffer();
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    await expect(withLockedRestaurantState((state) => {
      state.operations.blockedTableIds.push("t12");
      respondToWaitlist(state, state.waitlist[0], "accept", state.waitlist[0].offerId);
    })).rejects.toThrow("no longer available");
    expect(memory.state?.operations.blockedTableIds).toEqual([]);
    expect(memory.state?.operations.tableHolds).toHaveLength(0);
    expect(memory.state?.waitlist[0].status).toBe("expired");
  });
  it("rejects a stale replacement after expiry without resurrecting the offer", async () => {
    const offered = await addOffer();
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    expect(await replaceRestaurantState(offered.state, offered.state.revision)).toBeNull();
    expect(memory.state?.waitlist[0].status).toBe("expired");
    expect(memory.state?.operations.tableHolds).toHaveLength(0);
  });
  it("preserves authoritative holds on a current-revision staff replacement", async () => {
    const offered = await addOffer();
    const changed = structuredClone(offered.state);
    changed.waitlist = [];
    changed.operations.tableHolds = [];
    const updated = await replaceRestaurantState(changed, offered.state.revision);
    expect(updated?.waitlist).toHaveLength(1);
    expect(updated?.operations.tableHolds).toHaveLength(1);
  });
  it("serializes concurrent accepts, producing one accepted reservation", async () => {
    await addOffer();
    await Promise.all(Array.from({ length: 10 }, () => withLockedRestaurantState(async (state) => {
      await Promise.resolve();
      return respondToWaitlist(state, state.waitlist[0], "accept", state.waitlist[0].offerId);
    })));
    expect(memory.state?.reservations).toHaveLength(1);
    expect(memory.state?.waitlist[0].status).toBe("accepted");
  });
  it("serializes competing table offers, allowing only one", async () => {
    await withLockedRestaurantState((state) => {
      for (const phone of ["4165550100", "4165550101"]) joinWaitlist(state, waitlistJoinSchema.parse({
        guestName: "Guest", phone, partySize: 2, consent: true,
      }));
    });
    const outcomes = await Promise.allSettled([0, 1].map((index) => withLockedRestaurantState(async (state) => {
      await Promise.resolve();
      return staffWaitlistAction(state, state.waitlist[index].id, "offer", "t11");
    })));
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(memory.state?.operations.tableHolds).toHaveLength(1);
  });
});
