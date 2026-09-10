import "server-only";

import { db } from "@/lib/db";
import { getDemoRestaurantState, isDemoMode, updateDemoRestaurantState } from "@/lib/demo";
import { defaultRestaurantState, normalizeRestaurantState, type RestaurantState, type VersionedRestaurantState } from "@/lib/state";
import { expireWaitlist, protectWaitlistState } from "@/lib/waitlist-engine";

type StateRow = { state: unknown; revision: number };
let demoLock: Promise<unknown> = Promise.resolve();

export async function getRestaurantState(): Promise<VersionedRestaurantState> {
  return (await withLockedRestaurantState(() => undefined, () => false)).state;
}

export async function replaceRestaurantState(
  state: RestaurantState, expectedRevision: number,
): Promise<VersionedRestaurantState | null> {
  const updated = await withLockedRestaurantState((current, revision) => {
    if (revision !== expectedRevision || !protectWaitlistState(current, state)) return false;
    Object.assign(current, state);
    expireWaitlist(current);
    return true;
  }, Boolean);
  return updated.result ? updated.state : null;
}

export async function withLockedRestaurantState<T>(
  mutate: (state: RestaurantState, revision: number) => T | Promise<T>,
  shouldPersist: (result: T) => boolean = () => true,
): Promise<{ result: T; state: VersionedRestaurantState }> {
  // Expiry is committed even for read-only calls and rejected mutations. A failed
  // mutation is discarded; its business error is rethrown only after expiry commits.
  async function prepare(row: StateRow) {
    const expiredState = normalizeRestaurantState(structuredClone(row.state));
    const expired = expireWaitlist(expiredState);
    const state = structuredClone(expiredState);
    try {
      const result = await mutate(state, row.revision + (expired ? 1 : 0));
      const persistMutation = shouldPersist(result);
      return { result, error: undefined, failed: false, state: persistMutation ? state : expiredState, persist: persistMutation || expired };
    } catch (error) {
      return { result: undefined, error, failed: true, state: expiredState, persist: expired };
    }
  }

  async function runDemo() {
    const snapshot = getDemoRestaurantState();
    const prepared = await prepare({ state: snapshot, revision: snapshot.revision });
    const state = prepared.persist ? updateDemoRestaurantState(prepared.state) : snapshot;
    return { ...prepared, state };
  }

  const outcome = isDemoMode()
    ? await (() => {
      const next = demoLock.then(runDemo, runDemo);
      demoLock = next.catch(() => undefined);
      return next;
    })()
    : await db().begin(async (sql) => {
      const defaults = defaultRestaurantState();
      await sql`
        INSERT INTO app_state (id, state) VALUES (1, ${sql.json(defaults)})
        ON CONFLICT (id) DO NOTHING
      `;
      const [row] = await sql<StateRow[]>`
        SELECT state, revision FROM app_state WHERE id = 1 FOR UPDATE
      `;
      const prepared = await prepare(row);
      if (!prepared.persist) {
        return { ...prepared, state: { ...prepared.state, revision: row.revision } };
      }
      const [updated] = await sql<StateRow[]>`
        UPDATE app_state
        SET state = ${sql.json(prepared.state)}, revision = revision + 1, updated_at = now()
        WHERE id = 1 RETURNING state, revision
      `;
      return { ...prepared, state: { ...normalizeRestaurantState(updated.state), revision: updated.revision } };
    });
  if (outcome.failed) throw outcome.error;
  return { result: outcome.result as T, state: outcome.state };
}
