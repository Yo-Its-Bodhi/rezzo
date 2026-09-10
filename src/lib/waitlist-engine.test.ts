import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/restaurant", async () => import("./restaurant"));
import { defaultRestaurantState, type RestaurantState } from "./state";
import type { StoredReservation } from "./restaurant";
import {
  ARRIVAL_MS, OFFER_MS, TURN_MS, authenticateWaitlist, expireWaitlist, joinWaitlist,
  normalizeWaitlistPhone, protectWaitlistState, respondToWaitlist, staffWaitlistAction,
  staffWaitlistState, waitingEntries, waitlistCredential, waitlistJoinSchema, waitlistTicket,
} from "./waitlist-engine";
import { getEligibleTables } from "./availability";

const now = new Date("2026-09-06T20:00:00.000Z");
let state: RestaurantState;
function join(phone = "4165550100", at = now, partySize = 4) {
  return joinWaitlist(state, waitlistJoinSchema.parse({
    guestName: "  Guest  ", phone, partySize, consent: true,
  }), at);
}
function offer(at = now) {
  const { entry, token } = join();
  staffWaitlistAction(state, entry.id, "offer", "t11", at);
  return { entry, token };
}
function reservation(overrides: Partial<StoredReservation> = {}): StoredReservation {
  return {
    id: "other", confirmationCode: "LC-OTHER", guestName: "Other", email: "other@example.com",
    phone: "4165550101", partySize: 2, startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + TURN_MS).toISOString(), tableId: "t11",
    status: "confirmed", source: "staff", policyVersion: 1, policyAcceptedAt: now.toISOString(),
    ...overrides,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SESSION_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  state = defaultRestaurantState();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("private tickets and queue", () => {
  it("normalizes phone numbers and trims names", () => {
    expect(join(" (416) 555-0100 ").entry).toMatchObject({ phone: "+14165550100", guestName: "Guest" });
    expect(normalizeWaitlistPhone("+44 20 7946 0123")).toBe("+442079460123");
    for (const phone of ["123", "416abcd5550100", "++14165550100", "0000000", "javascript:1234567890"]) {
      expect(normalizeWaitlistPhone(phone)).toBeNull();
    }
  });
  it("rejects oversized parties and missing consent", () => {
    expect(() => waitlistJoinSchema.parse({ guestName: "Guest", phone: "4165550100", partySize: 7, consent: true })).toThrow();
    expect(() => waitlistJoinSchema.parse({ guestName: "Guest", phone: "4165550100", partySize: 2 })).toThrow();
  });
  it("stores a hash, never a bearer token, and rejects forged credentials", () => {
    const { entry, token } = join();
    expect(token.length).toBeGreaterThan(70);
    expect(JSON.stringify(state)).not.toContain(token);
    expect(entry.tokenHash).toHaveLength(64);
    expect(waitlistCredential(entry)).toBe(token);
    expect(authenticateWaitlist(state, token)).toBe(entry);
    expect(() => authenticateWaitlist(state, `${entry.id}.forged`)).toThrow("Invalid");
  });
  it("does not hand out an existing phone ticket; own bearer safely retries", () => {
    const first = join();
    expect(() => join("+1 416 555 0100")).toThrow("active ticket");
    const same = joinWaitlist(state, waitlistJoinSchema.parse({
      guestName: "Other person", phone: "+14165550100", partySize: 2, consent: true,
    }), now, first.token);
    expect(same.entry.id).toBe(first.entry.id);
    expect(state.waitlist).toHaveLength(1);
  });
  it("exposes only this guest's ticket and correct waiting position", () => {
    join();
    const second = join("4165550101");
    const third = join("4165550102");
    expect(waitlistTicket(state, second.entry, now)).toMatchObject({ position: 2, aheadCount: 1 });
    staffWaitlistAction(state, state.waitlist[0].id, "offer", "t11", now);
    expect(waitlistTicket(state, second.entry, now)).toMatchObject({ position: 1, aheadCount: 0 });
    const ticket = waitlistTicket(state, third.entry, now);
    expect(ticket).not.toHaveProperty("phone");
    expect(ticket).not.toHaveProperty("tokenHash");
    expect(ticket).not.toHaveProperty("credentialNonce");
    expect(ticket).not.toHaveProperty("pushSubscription");
    expect(ticket).not.toHaveProperty("notes");
  });
  it("uses Toronto's day, including UTC midnight, and expires yesterday's queue", () => {
    const { entry } = join("4165550100", new Date("2026-09-06T03:55:00Z"));
    expect(waitingEntries(state, new Date("2026-09-06T03:59:00Z"))).toHaveLength(1);
    expect(expireWaitlist(state, new Date("2026-09-06T04:00:00Z"))).toBe(true);
    expect(entry.status).toBe("expired");
    expect(waitingEntries(state, now)).toHaveLength(0);
  });
  it("up-next is advisory, idempotent, and creates no table protection", () => {
    const { entry } = join();
    expect(staffWaitlistAction(state, entry.id, "up_next", undefined, now).notify).toBe("up_next");
    expect(staffWaitlistAction(state, entry.id, "up_next", undefined, now).notify).toBeUndefined();
    expect(entry.status).toBe("waiting");
    expect(state.operations.tableHolds).toHaveLength(0);
  });
});

describe("locked offer state machine", () => {
  it("protects the entire latest possible two-hour turn, not just five minutes", () => {
    const { entry } = offer();
    expect(state.operations.tableHolds[0]).toMatchObject({
      waitlistEntryId: entry.id,
      expiresAt: new Date(now.getTime() + OFFER_MS).toISOString(),
      endsAt: new Date(now.getTime() + OFFER_MS + TURN_MS).toISOString(),
    });
    const eligible = getEligibleTables({
      startsAt: new Date(now.getTime() + 90 * 60_000), partySize: 2, tables: state.tables,
      occupancies: [],
      blocks: state.operations.tableHolds.map((hold) => ({ ...hold, startsAt: new Date(hold.startsAt), endsAt: new Date(hold.endsAt) })),
      config: { timezone: "America/Toronto", durationMinutes: 120, startsPerClockHour: 99 },
    });
    expect(eligible.some((table) => table.id === "t11")).toBe(false);
  });
  it("rejects a competing offer and repeat offers do not extend the deadline", () => {
    const { entry } = offer();
    const old = entry.offerExpiresAt;
    staffWaitlistAction(state, entry.id, "offer", "t11", new Date(now.getTime() + 60_000));
    expect(entry.offerExpiresAt).toBe(old);
    expect(state.operations.tableHolds).toHaveLength(1);
    const second = join("4165550101");
    expect(() => staffWaitlistAction(state, second.entry.id, "offer", "t11", now)).toThrow("held");
    expect(second.entry.status).toBe("waiting");
  });
  it.each(["missing", "capacity", "blocked", "hold", "future", "overdue"] as const)(
    "rejects %s table conflicts",
    (kind) => {
      const { entry } = join();
      let tableId = "t11";
      if (kind === "missing") tableId = "unknown";
      if (kind === "capacity") tableId = "t41";
      if (kind === "blocked") state.operations.blockedTableIds.push(tableId);
      if (kind === "hold") state.operations.tableHolds.push({
        id: "private", tableId, startsAt: new Date(now.getTime() + 90 * 60_000).toISOString(),
        endsAt: new Date(now.getTime() + 180 * 60_000).toISOString(), reason: "Block",
      });
      if (kind === "future") state.reservations.push(reservation({
        startsAt: new Date(now.getTime() + TURN_MS + 60_000).toISOString(),
        endsAt: new Date(now.getTime() + TURN_MS * 2).toISOString(),
      }));
      if (kind === "overdue") state.reservations.push(reservation({
        status: "seated", startsAt: new Date(now.getTime() - TURN_MS * 2).toISOString(),
        endsAt: new Date(now.getTime() - TURN_MS).toISOString(),
      }));
      expect(() => staffWaitlistAction(state, entry.id, "offer", tableId, now)).toThrow();
      expect(state.operations.tableHolds.filter((hold) => hold.waitlistEntryId)).toHaveLength(0);
    },
  );
  it("expires exactly at the offer deadline, releases hold, and cannot accept", () => {
    const { entry } = offer();
    const deadline = new Date(now.getTime() + OFFER_MS);
    expect(expireWaitlist(state, new Date(deadline.getTime() - 1))).toBe(false);
    expect(() => respondToWaitlist(state, entry, "accept", entry.offerId, deadline)).toThrow("no longer available");
    expect(entry.status).toBe("expired");
    expect(state.operations.tableHolds).toHaveLength(0);
    expect(state.reservations).toHaveLength(0);
  });
  it("accepts once even when responses repeat, and does not extend grace", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    const deadline = entry.arrivalDeadline;
    respondToWaitlist(state, entry, "accept", entry.offerId, new Date(now.getTime() + 60_000));
    expect(state.reservations).toHaveLength(1);
    expect(state.reservations[0]).toMatchObject({ source: "waitlist", status: "confirmed", startsAt: now.toISOString() });
    expect(entry.arrivalDeadline).toBe(deadline);
    expect(state.operations.tableHolds).toHaveLength(0);
    expect(waitlistTicket(state, entry, now)).toMatchObject({ status: "accepted", position: null, aheadCount: 0 });
  });
  it("rechecks occupancy at acceptance without losing the pending offer", () => {
    const { entry } = offer();
    state.reservations.push(reservation());
    expect(() => respondToWaitlist(state, entry, "accept", entry.offerId, now)).toThrow("occupied");
    expect(entry.status).toBe("offered");
    expect(state.operations.tableHolds).toHaveLength(1);
  });
  it("declines idempotently and rejects conflicting double responses", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "decline", entry.offerId, now);
    respondToWaitlist(state, entry, "decline", entry.offerId, now);
    expect(state.operations.tableHolds).toHaveLength(0);
    expect(() => respondToWaitlist(state, entry, "accept", entry.offerId, now)).toThrow();
  });
  it("rejects old offer ids after requeue and new offer", () => {
    const { entry } = offer();
    const oldId = entry.offerId;
    respondToWaitlist(state, entry, "decline", oldId, now);
    join("4165550101");
    staffWaitlistAction(state, entry.id, "requeue", undefined, now);
    expect(waitingEntries(state, now).at(-1)?.id).toBe(entry.id);
    const rejoinedAt = entry.joinedAt;
    staffWaitlistAction(state, entry.id, "requeue", undefined, now);
    expect(entry.joinedAt).toBe(rejoinedAt);
    staffWaitlistAction(state, entry.id, "offer", "t12", now);
    expect(entry.offerId).not.toBe(oldId);
    expect(() => respondToWaitlist(state, entry, "accept", oldId, now)).toThrow("current");
    expect(state.reservations).toHaveLength(0);
  });
  it("does not move an active waiting ticket to the back using requeue", () => {
    const { entry } = join();
    expect(() => staffWaitlistAction(state, entry.id, "requeue", undefined, now)).toThrow("closed");
  });
  it("releases accepted no-shows at the exact 15-minute grace deadline", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    expect(expireWaitlist(state, new Date(now.getTime() + ARRIVAL_MS - 1))).toBe(false);
    expect(expireWaitlist(state, new Date(now.getTime() + ARRIVAL_MS))).toBe(true);
    expect(entry.status).toBe("expired");
    expect(state.reservations[0].status).toBe("no_show");
    expect(() => staffWaitlistAction(state, entry.id, "seat", undefined, new Date(now.getTime() + ARRIVAL_MS))).toThrow();
  });
  it.each(["arrived", "seated"] as const)("protects %s reservations after grace", (status) => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    state.reservations[0].status = status;
    expireWaitlist(state, new Date(now.getTime() + ARRIVAL_MS));
    expect(state.reservations[0].status).toBe(status);
    expect(entry.status).toBe(status === "arrived" ? "accepted" : "seated");
  });
  it("staff seating is idempotent and overdue seated tables stay protected", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    staffWaitlistAction(state, entry.id, "seat", undefined, now);
    staffWaitlistAction(state, entry.id, "seat", undefined, now);
    const later = new Date(now.getTime() + TURN_MS * 2);
    expireWaitlist(state, later);
    expect(entry.status).toBe("seated");
    const second = join("4165550101", later);
    expect(() => staffWaitlistAction(state, second.entry.id, "offer", "t11", later)).toThrow("occupied");
    expect(() => staffWaitlistAction(state, entry.id, "requeue", undefined, later)).toThrow("closed");
  });
  it("removing an offer releases its hold and waiting guests can leave idempotently", () => {
    const { entry } = offer();
    staffWaitlistAction(state, entry.id, "remove", undefined, now);
    expect(state.operations.tableHolds).toHaveLength(0);
    const second = join("4165550101");
    respondToWaitlist(state, second.entry, "leave", undefined, now);
    respondToWaitlist(state, second.entry, "leave", undefined, now);
    expect(second.entry.status).toBe("removed");
  });
  it("accepted guests can leave idempotently, cancelling their reservation", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    respondToWaitlist(state, entry, "leave", entry.offerId, now);
    respondToWaitlist(state, entry, "leave", entry.offerId, now);
    expect(entry.status).toBe("removed");
    expect(state.reservations[0].status).toBe("cancelled");
  });
  it("requires the current offer id to leave a held table", () => {
    const { entry } = offer();
    expect(() => respondToWaitlist(state, entry, "leave", undefined, now)).toThrow("current");
    expect(state.operations.tableHolds).toHaveLength(1);
    respondToWaitlist(state, entry, "leave", entry.offerId, now);
    expect(state.operations.tableHolds).toHaveLength(0);
  });
  it.each(["arrived", "seated"] as const)("guest leave cannot release an %s party", (status) => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    state.reservations[0].status = status;
    expect(() => respondToWaitlist(state, entry, "leave", entry.offerId, now)).toThrow();
    expect(state.reservations[0].status).toBe(status);
  });
});

describe("authoritative state protection", () => {
  it("strips all credential and subscription secrets from staff state", () => {
    const { entry, token } = join();
    entry.pushSubscription = { endpoint: "https://secret", keys: { auth: "secret", p256dh: "secret" } };
    const serialized = JSON.stringify(staffWaitlistState({ ...state, revision: 1 }));
    for (const privateValue of [token, entry.tokenHash!, entry.credentialNonce!, "https://secret"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
  it("restores managed entries and holds removed by a staff PUT", () => {
    offer();
    const proposed = structuredClone(state);
    proposed.waitlist = [];
    proposed.operations.tableHolds = [];
    expect(protectWaitlistState(state, proposed)).toBe(true);
    expect(proposed.waitlist).toEqual(state.waitlist);
    expect(proposed.operations.tableHolds).toEqual(state.operations.tableHolds);
  });
  it("rejects manual conflicting bookings and table deletion during an offer", () => {
    offer();
    const proposed = structuredClone(state);
    proposed.reservations.push(reservation());
    expect(protectWaitlistState(state, proposed)).toBe(false);
    const deleted = structuredClone(state);
    deleted.tables = deleted.tables.filter((table) => table.id !== "t11");
    expect(protectWaitlistState(state, deleted)).toBe(false);
  });
  it("permits deleting an ordinary accepted reservation and closes its ticket", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    const deleted = structuredClone(state);
    deleted.reservations = [];
    expect(protectWaitlistState(state, deleted)).toBe(true);
    expect(deleted.waitlist[0].status).toBe("removed");
    const arrived = structuredClone(state);
    arrived.reservations[0].status = "arrived";
    expect(protectWaitlistState(state, arrived)).toBe(true);
  });
  it.each(["accepted", "seated"] as const)("allows regular %s reservation moves, party and time edits", (status) => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    if (status === "seated") staffWaitlistAction(state, entry.id, "seat", undefined, now);
    const proposed = structuredClone(state);
    Object.assign(proposed.reservations[0], {
      tableId: "t12", partySize: 6,
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + TURN_MS + 60_000).toISOString(),
    });
    expect(protectWaitlistState(state, proposed)).toBe(true);
    expect(proposed.waitlist[0]).toMatchObject({ offerTableId: "t12", partySize: 6 });
    expect(waitlistTicket(proposed, proposed.waitlist[0], now).tableName).toBe("12");
    if (status === "accepted") {
      expect(proposed.waitlist[0].arrivalDeadline).toBe(new Date(now.getTime() + ARRIVAL_MS + 60_000).toISOString());
      expireWaitlist(proposed, new Date(now.getTime() + ARRIVAL_MS));
      expect(proposed.waitlist[0].status).toBe("accepted");
    }
  });
  it("does not protect historical tables once a seated reservation is completed", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    staffWaitlistAction(state, entry.id, "seat", undefined, now);
    state.reservations[0].status = "completed";
    const deleted = structuredClone(state);
    deleted.tables = deleted.tables.filter((table) => table.id !== "t11");
    expect(protectWaitlistState(state, deleted)).toBe(true);
    const reduced = structuredClone(state);
    reduced.tables.find((table) => table.id === "t11")!.capacity = 1;
    expect(protectWaitlistState(state, reduced)).toBe(true);
  });
  it("rejects accepted reservation moves that conflict with another pending offer", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    const second = join("4165550101");
    staffWaitlistAction(state, second.entry.id, "offer", "t12", now);
    const proposed = structuredClone(state);
    proposed.reservations[0].tableId = "t12";
    expect(protectWaitlistState(state, proposed)).toBe(false);
  });
  it("rejects seating or moving seated parties onto occupied tables", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    const proposed = structuredClone(state);
    proposed.reservations[0].status = "seated";
    proposed.reservations.push(reservation());
    expect(protectWaitlistState(state, proposed)).toBe(false);
    staffWaitlistAction(state, entry.id, "seat", undefined, now);
    const moved = structuredClone(state);
    moved.reservations[0].tableId = "t12";
    moved.reservations.push(reservation({
      tableId: "t12", status: "seated", endsAt: new Date(now.getTime() - 60_000).toISOString(),
    }));
    expect(protectWaitlistState(state, moved)).toBe(false);
  });
  it("synchronizes reservation assignments during lazy polling, and seats all assigned tables safely", () => {
    const { entry } = offer();
    respondToWaitlist(state, entry, "accept", entry.offerId, now);
    Object.assign(state.reservations[0], { tableId: "t12", tableIds: ["t12", "t13"], partySize: 6 });
    expireWaitlist(state, now);
    expect(entry.offerTableId).toBe("t12");
    expect(entry.partySize).toBe(6);
    state.reservations.push(reservation({ tableId: "t13" }));
    expect(() => staffWaitlistAction(state, entry.id, "seat", undefined, now)).toThrow("occupied");
    state.reservations.pop();
    staffWaitlistAction(state, entry.id, "seat", undefined, now);
    expect(entry.status).toBe("seated");
  });
});
