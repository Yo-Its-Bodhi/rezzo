import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantState, VersionedRestaurantState } from "./state";

type TestSql = ((parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & { json: (value: unknown) => unknown };
const database = vi.hoisted(() => ({
  state: null as VersionedRestaurantState | null,
  statements: [] as string[],
  lock: Promise.resolve() as Promise<unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/demo", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/restaurant", async () => import("./restaurant"));
vi.mock("@/lib/state", async () => import("./state"));
vi.mock("@/lib/waitlist-engine", async () => import("./waitlist-engine"));
vi.mock("@/lib/db", () => ({
  db: () => ({
    begin: (callback: (sql: TestSql) => Promise<unknown>) => {
      const next = database.lock.then(async () => {
        let row = structuredClone(database.state);
        const sql = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
          const statement = parts.join("?").replace(/\s+/g, " ").trim();
          database.statements.push(statement);
          if (statement.startsWith("INSERT")) {
            row ??= { ...values[0] as RestaurantState, revision: 1 };
            return [];
          }
          if (statement.startsWith("SELECT")) {
            if (!statement.includes("FOR UPDATE")) throw new Error("Missing row lock!");
            return [{ state: structuredClone(row), revision: row!.revision }];
          }
          if (statement.startsWith("UPDATE")) {
            row = { ...values[0] as RestaurantState, revision: row!.revision + 1 };
            return [{ state: structuredClone(row), revision: row.revision }];
          }
          throw new Error("Unexpected SQL in test.");
        }, { json: (value: unknown) => value });
        const result = await callback(sql);
        database.state = row;
        return result;
      });
      database.lock = next.catch(() => undefined);
      return next;
    },
  }),
}));
import { defaultRestaurantState } from "./state";
import { getRestaurantState, withLockedRestaurantState } from "./state-store";
import { OFFER_MS, joinWaitlist, respondToWaitlist, staffWaitlistAction, waitlistJoinSchema } from "./waitlist-engine";

const now = new Date("2026-09-06T20:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("SESSION_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  database.state = { ...defaultRestaurantState(), revision: 1 };
  database.statements = [];
  database.lock = Promise.resolve();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function offered() {
  return withLockedRestaurantState((state) => {
    const { entry } = joinWaitlist(state, waitlistJoinSchema.parse({
      guestName: "Guest", phone: "4165550100", partySize: 4, consent: true,
    }));
    staffWaitlistAction(state, entry.id, "offer", "t11");
  });
}

describe("Postgres waitlist transaction path (isolated SQL double)", () => {
  it("locks reads and commits lazy expiry once", async () => {
    const initial = await offered();
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    const expired = await getRestaurantState();
    expect(expired.revision).toBe(initial.state.revision + 1);
    expect(database.state?.waitlist[0].status).toBe("expired");
    expect(database.state?.operations.tableHolds).toHaveLength(0);
    expect(database.statements.filter((sql) => sql.startsWith("SELECT")).every((sql) => sql.endsWith("FOR UPDATE"))).toBe(true);
    expect((await getRestaurantState()).revision).toBe(expired.revision);
  });
  it("commits expiry before surfacing an exact-deadline response error", async () => {
    await offered();
    vi.setSystemTime(new Date(now.getTime() + OFFER_MS));
    await expect(withLockedRestaurantState((state) =>
      respondToWaitlist(state, state.waitlist[0], "accept", state.waitlist[0].offerId),
    )).rejects.toThrow("no longer available");
    expect(database.state?.waitlist[0].status).toBe("expired");
    expect(database.state?.operations.tableHolds).toHaveLength(0);
  });
  it("concurrent accept transactions retain only one reservation", async () => {
    await offered();
    await Promise.all(Array.from({ length: 5 }, () => withLockedRestaurantState((state) =>
      respondToWaitlist(state, state.waitlist[0], "accept", state.waitlist[0].offerId),
    )));
    expect(database.state?.reservations).toHaveLength(1);
    expect(database.state?.waitlist[0].status).toBe("accepted");
  });
});
