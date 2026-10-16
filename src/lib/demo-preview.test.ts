import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  open: vi.fn(() => {
    throw new Error("Real database adapter selected");
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: database.open }));
vi.mock("@/lib/restaurant", async () => import("./restaurant"));
vi.mock("@/lib/state", async () => import("./state"));
vi.mock("@/lib/waitlist-engine", async () => import("./waitlist-engine"));
vi.mock("@/lib/demo", async () => import("./demo"));
import { isDemoMode } from "./demo";
import { getRestaurantState, withLockedRestaurantState } from "./state-store";

beforeEach(() => {
  database.open.mockClear();
  globalThis.__rezzoDemoState = undefined;
});
afterEach(() => {
  globalThis.__rezzoDemoState = undefined;
  vi.unstubAllEnvs();
});

describe("explicit production demo preview", () => {
  it.each([
    [undefined, undefined],
    ["true", undefined],
    [undefined, "true"],
    ["TRUE", "true"],
    ["true", "false"],
  ])(
    "retains the real database path without both exact flags (%s, %s)",
    async (mode, preview) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("REZZO_DEMO_MODE", mode);
      vi.stubEnv("REZZO_DEMO_PREVIEW", preview);
      expect(isDemoMode()).toBe(false);
      await expect(getRestaurantState()).rejects.toThrow(
        "Real database adapter selected",
      );
      expect(database.open).toHaveBeenCalledOnce();
      expect(globalThis.__rezzoDemoState).toBeUndefined();
    },
  );

  it("uses only the existing in-memory state for an explicitly opted-in production preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REZZO_DEMO_MODE", "true");
    vi.stubEnv("REZZO_DEMO_PREVIEW", "true");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://unused-preview-guard.invalid/example",
    );
    expect(isDemoMode()).toBe(true);
    await withLockedRestaurantState((state) => {
      state.operations.blockedTableIds.push("preview-only-check");
    });
    expect((await getRestaurantState()).operations.blockedTableIds).toContain(
      "preview-only-check",
    );
    expect(database.open).not.toHaveBeenCalled();
  });

  it("keeps the existing single-flag local development demo", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REZZO_DEMO_MODE", "true");
    vi.stubEnv("REZZO_DEMO_PREVIEW", undefined);
    expect(isDemoMode()).toBe(true);
  });
});
