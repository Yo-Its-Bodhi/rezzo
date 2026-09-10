import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { reservationConflictsWithTurn, reservationOccupiesTableAt } from "./live-service";
import { RESTAURANT_TIMEZONE, reservationTableIds, type StoredReservation, type StoredWaitlistEntry } from "./restaurant";
import type { RestaurantState, VersionedRestaurantState } from "./state";
import { ARRIVAL_MS, OFFER_MS, TURN_MS, type WaitlistStaffAction, type WaitlistTicket } from "./waitlist-types";

export { ARRIVAL_MS, OFFER_MS, TURN_MS } from "./waitlist-types";
const ACTIVE = ["waiting", "offered", "accepted"];
const TERMINAL = ["declined", "expired", "removed"];

export class WaitlistError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function waitlistDay(at: Date) {
  return formatInTimeZone(at, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
}

export function normalizeWaitlistPhone(phone: string) {
  const trimmed = phone.trim();
  if (!/^\+?[\d ()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

export const waitlistJoinSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).transform(normalizeWaitlistPhone)
    .refine((value) => value !== null, "Enter a valid phone number."),
  partySize: z.number().int().min(1).max(6),
  notes: z.string().trim().max(500).optional(),
  consent: z.literal(true),
});

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new WaitlistError("Waitlist credentials are not configured.", 503);
  return value;
}

export function waitlistCredential(entry: StoredWaitlistEntry) {
  if (!entry.credentialNonce) throw new WaitlistError("This ticket has no guest credential.");
  const signature = createHmac("sha256", secret())
    .update(`waitlist:${entry.id}:${entry.credentialNonce}`).digest("base64url");
  return `${entry.id}.${signature}`;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export function authenticateWaitlist(state: RestaurantState, token: string | null) {
  if (!token || token.length > 200) throw new WaitlistError("Invalid waitlist ticket.", 401);
  const entry = state.waitlist.find((item) => item.id === token.split(".")[0]);
  const actual = hashToken(token);
  const expected = Buffer.from(entry?.tokenHash ?? "", "hex");
  if (!entry || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new WaitlistError("Invalid waitlist ticket.", 401);
  }
  return entry;
}

export function waitingEntries(state: RestaurantState, now: Date) {
  return state.waitlist.filter((entry) =>
    entry.status === "waiting" && waitlistDay(new Date(entry.joinedAt)) === waitlistDay(now),
  ).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

function releaseHold(state: RestaurantState, entry: StoredWaitlistEntry) {
  state.operations.tableHolds = state.operations.tableHolds.filter((hold) => hold.waitlistEntryId !== entry.id);
}

function synchronizeWaitlistReservations(state: RestaurantState) {
  let changed = false;
  for (const entry of state.waitlist) {
    if (!["accepted", "seated"].includes(entry.status)) continue;
    const reservation = state.reservations.find((item) => item.id === entry.reservationId);
    if (!reservation || reservation.archivedAt) {
      entry.status = "removed";
      changed = true;
      continue;
    }
    const tableId = reservation.tableId || reservationTableIds(reservation)[0];
    if (entry.offerTableId !== tableId) { entry.offerTableId = tableId; changed = true; }
    if (entry.partySize !== reservation.partySize) { entry.partySize = reservation.partySize; changed = true; }
    if (entry.status === "accepted") {
      const deadline = new Date(Date.parse(reservation.startsAt) + ARRIVAL_MS).toISOString();
      if (entry.arrivalDeadline !== deadline) { entry.arrivalDeadline = deadline; changed = true; }
    }
  }
  return changed;
}

export function expireWaitlist(state: RestaurantState, now = new Date()) {
  let changed = synchronizeWaitlistReservations(state);
  for (const entry of state.waitlist) {
    const reservation = state.reservations.find((item) => item.id === entry.reservationId);
    if (entry.status === "accepted" && reservation?.status === "seated") {
      entry.status = "seated";
      changed = true;
    } else if (entry.status === "accepted" && reservation &&
      ["cancelled", "no_show", "completed"].includes(reservation.status)) {
      entry.status = reservation.status === "no_show" ? "expired" : "removed";
      changed = true;
    } else if (
      (entry.status === "waiting" && waitlistDay(new Date(entry.joinedAt)) !== waitlistDay(now)) ||
      (entry.status === "offered" && (!entry.offerExpiresAt || Date.parse(entry.offerExpiresAt) <= now.getTime())) ||
      (entry.status === "accepted" && entry.arrivalDeadline &&
        Date.parse(entry.arrivalDeadline) <= now.getTime() && reservation?.status !== "arrived")
    ) {
      entry.status = "expired";
      releaseHold(state, entry);
      if (reservation?.status === "confirmed") reservation.status = "no_show";
      changed = true;
    }
  }
  const before = state.operations.tableHolds.length;
  state.operations.tableHolds = state.operations.tableHolds.filter((hold) =>
    !hold.waitlistEntryId || state.waitlist.some((entry) =>
      entry.id === hold.waitlistEntryId && entry.status === "offered"),
  );
  return changed || before !== state.operations.tableHolds.length;
}

export function joinWaitlist(
  state: RestaurantState,
  input: z.infer<typeof waitlistJoinSchema>,
  now = new Date(),
  bearer: string | null = null,
) {
  expireWaitlist(state, now);
  const existing = state.waitlist.find((entry) =>
    normalizeWaitlistPhone(entry.phone) === input.phone && ACTIVE.includes(entry.status),
  );
  if (existing) {
    if (bearer && authenticateWaitlist(state, bearer).id === existing.id) return { entry: existing, token: bearer };
    throw new WaitlistError("An active ticket already uses this phone. Open your existing ticket or speak to the host.");
  }
  const entry: StoredWaitlistEntry = {
    id: randomUUID(), credentialNonce: randomBytes(32).toString("base64url"),
    guestName: input.guestName, phone: input.phone!, email: "", partySize: input.partySize,
    notes: input.notes, joinedAt: now.toISOString(), consentAt: now.toISOString(), status: "waiting",
  };
  const token = waitlistCredential(entry);
  entry.tokenHash = hashToken(token).toString("hex");
  state.waitlist.push(entry);
  return { entry, token };
}

export function waitlistTicket(state: RestaurantState, entry: StoredWaitlistEntry, now = new Date()): WaitlistTicket {
  const index = waitingEntries(state, now).findIndex((item) => item.id === entry.id);
  const reservation = state.reservations.find((item) => item.id === entry.reservationId);
  return {
    id: entry.id, guestName: entry.guestName, partySize: entry.partySize, status: entry.status,
    joinedAt: entry.joinedAt, position: index < 0 ? null : index + 1, aheadCount: Math.max(0, index),
    upNextAt: entry.upNextAt, offerId: entry.offerId, offerExpiresAt: entry.offerExpiresAt,
    tableName: state.tables.find((table) => table.id === (reservation?.tableId || entry.offerTableId))?.name,
    reservationCode: reservation?.confirmationCode, arrivalDeadline: entry.arrivalDeadline,
    serverNow: now.toISOString(), pushEnabled: Boolean(entry.pushSubscription),
  };
}

function validateTable(state: RestaurantState, entry: StoredWaitlistEntry, tableId: string | undefined, now: Date, endsAt: Date) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) throw new WaitlistError("Select a table for this offer.", 400);
  if (table.capacity < entry.partySize) throw new WaitlistError("This table cannot fit the party.");
  assertTableAvailable(state, table.id, now, endsAt, entry.reservationId, entry.id);
  return table;
}

function assertTableAvailable(
  state: RestaurantState, tableId: string, now: Date, endsAt: Date,
  reservationId?: string, waitlistEntryId?: string,
) {
  if (state.operations.blockedTableIds.includes(tableId)) throw new WaitlistError("This table is blocked.");
  if (state.operations.tableHolds.some((hold) =>
    hold.tableId === tableId && (!waitlistEntryId || hold.waitlistEntryId !== waitlistEntryId) &&
    Date.parse(hold.startsAt) < endsAt.getTime() && Date.parse(hold.endsAt) > now.getTime(),
  )) throw new WaitlistError("This table is held during the requested turn.");
  if (state.reservations.some((reservation) =>
    reservation.id !== reservationId && reservationTableIds(reservation).includes(tableId) &&
    (reservationOccupiesTableAt(reservation, now) || reservationConflictsWithTurn(reservation, now, endsAt)),
  )) throw new WaitlistError("This table is occupied or booked during the requested turn.");
}

function validateSeating(state: RestaurantState, reservation: StoredReservation, now: Date) {
  const tableIds = reservationTableIds(reservation);
  const tables = tableIds.map((id) => state.tables.find((table) => table.id === id));
  if (!tables.length || tables.some((table) => !table)) throw new WaitlistError("Assign an existing table before seating this party.");
  if (tables.reduce((total, table) => total + table!.capacity, 0) < reservation.partySize) {
    throw new WaitlistError("The assigned tables cannot fit the party.");
  }
  const endsAt = new Date(Math.max(Date.parse(reservation.endsAt), now.getTime() + 1));
  for (const tableId of tableIds) assertTableAvailable(state, tableId, now, endsAt, reservation.id);
}

export function staffWaitlistAction(
  state: RestaurantState,
  entryId: string,
  action: WaitlistStaffAction,
  tableId?: string,
  now = new Date(),
) {
  expireWaitlist(state, now);
  const entry = state.waitlist.find((item) => item.id === entryId);
  if (!entry) throw new WaitlistError("Waitlist ticket not found.", 404);
  let notify: "offer" | "up_next" | undefined;
  if (action === "up_next") {
    if (entry.status !== "waiting") throw new WaitlistError("Only waiting guests can be marked up next.");
    if (!entry.upNextAt) { entry.upNextAt = now.toISOString(); notify = "up_next"; }
  } else if (action === "offer") {
    if (entry.status === "offered" && tableId === entry.offerTableId) return { entry, notify };
    if (entry.status !== "waiting") throw new WaitlistError("Only waiting guests can receive an offer.");
    const endsAt = new Date(now.getTime() + OFFER_MS + TURN_MS);
    validateTable(state, entry, tableId, now, endsAt);
    entry.status = "offered";
    entry.offerId = randomUUID();
    entry.offerTableId = tableId;
    entry.offerExpiresAt = new Date(now.getTime() + OFFER_MS).toISOString();
    state.operations.tableHolds.push({
      id: `waitlist:${entry.offerId}`, waitlistEntryId: entry.id, tableId: tableId!,
      startsAt: now.toISOString(), endsAt: endsAt.toISOString(), expiresAt: entry.offerExpiresAt,
      reason: `Waitlist offer · ${entry.guestName}`,
    });
    notify = "offer";
  } else if (action === "seat") {
    if (entry.status === "seated") return { entry, notify };
    if (entry.status !== "accepted") throw new WaitlistError("Accept the offer before seating this party.");
    const reservation = state.reservations.find((item) => item.id === entry.reservationId);
    if (!reservation || !["confirmed", "arrived"].includes(reservation.status)) {
      throw new WaitlistError("The waitlist reservation is no longer available.");
    }
    validateSeating(state, reservation, now);
    reservation.status = "seated";
    entry.status = "seated";
  } else if (action === "remove") {
    if (entry.status === "removed") return { entry, notify };
    if (entry.status === "seated") throw new WaitlistError("Complete the seated reservation instead.");
    const reservation = state.reservations.find((item) => item.id === entry.reservationId);
    if (reservation?.status === "arrived") throw new WaitlistError("Manage this arrived party from its reservation.");
    if (reservation?.status === "confirmed") reservation.status = "cancelled";
    entry.status = "removed";
    releaseHold(state, entry);
  } else if (action === "requeue") {
    if (entry.status === "waiting" && entry.requeuedAt === entry.joinedAt) return { entry, notify };
    if (!TERMINAL.includes(entry.status)) throw new WaitlistError("Only closed tickets can be requeued.");
    if (state.waitlist.some((other) => other.id !== entry.id &&
      normalizeWaitlistPhone(other.phone) === normalizeWaitlistPhone(entry.phone) && ACTIVE.includes(other.status))) {
      throw new WaitlistError("This guest already has an active ticket.");
    }
    const latest = waitingEntries(state, now).at(-1);
    entry.joinedAt = new Date(Math.max(now.getTime(), latest ? Date.parse(latest.joinedAt) + 1 : 0)).toISOString();
    entry.requeuedAt = entry.joinedAt;
    entry.status = "waiting";
    delete entry.upNextAt;
    delete entry.offerId;
    delete entry.offerExpiresAt;
    delete entry.offerTableId;
    delete entry.reservationId;
    delete entry.arrivalDeadline;
    delete entry.lastDelivery;
  }
  if (notify) delete entry.lastDelivery;
  return { entry, notify };
}

export function respondToWaitlist(
  state: RestaurantState, entry: StoredWaitlistEntry,
  action: "accept" | "decline" | "leave", offerId?: string, now = new Date(),
) {
  expireWaitlist(state, now);
  if (action === "leave") {
    if (offerId && offerId !== entry.offerId) throw new WaitlistError("This offer is no longer current.");
    if (entry.status === "removed") return entry;
    if (!["waiting", "offered", "accepted"].includes(entry.status)) {
      throw new WaitlistError("This ticket can no longer leave the queue.");
    }
    if (entry.status !== "waiting" && (!offerId || offerId !== entry.offerId)) {
      throw new WaitlistError("This offer is no longer current.");
    }
    const reservation = state.reservations.find((item) => item.id === entry.reservationId);
    if (entry.status === "accepted" && (!reservation || reservation.status !== "confirmed")) {
      throw new WaitlistError("Please speak to the host to cancel an arrived or seated party.");
    }
    if (reservation?.status === "confirmed") reservation.status = "cancelled";
    entry.status = "removed";
    releaseHold(state, entry);
    return entry;
  }
  if (!offerId || offerId !== entry.offerId) throw new WaitlistError("This offer is no longer current.");
  if (action === "accept" && ["accepted", "seated"].includes(entry.status)) return entry;
  if (action === "decline" && entry.status === "declined") return entry;
  if (entry.status !== "offered") throw new WaitlistError("This offer is no longer available.");
  if (action === "decline") {
    entry.status = "declined";
    releaseHold(state, entry);
    return entry;
  }
  const endsAt = new Date(now.getTime() + TURN_MS);
  validateTable(state, entry, entry.offerTableId, now, endsAt);
  const reservationId = randomUUID();
  state.reservations.push({
    id: reservationId, confirmationCode: `WL-${randomBytes(6).toString("hex").toUpperCase()}`,
    guestName: entry.guestName, email: entry.email, phone: entry.phone, partySize: entry.partySize,
    startsAt: now.toISOString(), endsAt: endsAt.toISOString(), tableId: entry.offerTableId!,
    status: "confirmed", source: "waitlist", request: entry.notes,
    policyVersion: 1, policyAcceptedAt: entry.consentAt ?? now.toISOString(),
  });
  entry.reservationId = reservationId;
  entry.arrivalDeadline = new Date(now.getTime() + ARRIVAL_MS).toISOString();
  entry.status = "accepted";
  releaseHold(state, entry);
  return entry;
}

export function staffWaitlistState(state: VersionedRestaurantState): VersionedRestaurantState {
  return {
    ...state,
    waitlist: state.waitlist.map((entry) => {
      const safe = { ...entry, pushEnabled: Boolean(entry.pushSubscription) };
      delete safe.credentialNonce;
      delete safe.tokenHash;
      delete safe.pushSubscription;
      return safe;
    }),
  };
}

// Only pending offers are waitlist-managed protection. Accepted parties become
// ordinary reservations and retain the host's normal editing/moving workflow.
export function protectWaitlistState(current: RestaurantState, proposed: RestaurantState) {
  proposed.waitlist = structuredClone(current.waitlist);
  proposed.operations.tableHolds = [
    ...proposed.operations.tableHolds.filter((hold) => !hold.waitlistEntryId && !hold.id.startsWith("waitlist:")),
    ...current.operations.tableHolds.filter((hold) => current.waitlist.some((entry) =>
      entry.id === hold.waitlistEntryId && entry.status === "offered")),
  ];
  for (const entry of current.waitlist.filter((item) => item.status === "offered")) {
    const table = current.tables.find((item) => item.id === entry.offerTableId);
    if (table) {
      const next = proposed.tables.find((item) => item.id === table.id);
      if (!next || next.capacity < entry.partySize) return false;
    }
    const hold = current.operations.tableHolds.find((item) => item.waitlistEntryId === entry.id);
    if (!hold) return false;
    const startsAt = new Date(hold.startsAt);
    const endsAt = new Date(hold.endsAt);
    if (proposed.operations.blockedTableIds.includes(entry.offerTableId!) &&
      !current.operations.blockedTableIds.includes(entry.offerTableId!)) return false;
    if (proposed.reservations.some((item) =>
      reservationTableIds(item).includes(entry.offerTableId!) && reservationConflictsWithTurn(item, startsAt, endsAt))) return false;
    if (proposed.operations.tableHolds.some((item) => !item.waitlistEntryId && item.tableId === entry.offerTableId &&
      Date.parse(item.startsAt) < endsAt.getTime() && Date.parse(item.endsAt) > startsAt.getTime())) return false;
  }
  for (const entry of current.waitlist.filter((item) => ["accepted", "seated"].includes(item.status))) {
    const previous = current.reservations.find((item) => item.id === entry.reservationId);
    const next = proposed.reservations.find((item) => item.id === entry.reservationId);
    if (next?.status === "seated" && !next.archivedAt &&
      (previous?.status !== "seated" ||
        JSON.stringify(reservationTableIds(previous)) !== JSON.stringify(reservationTableIds(next)))) {
      try { validateSeating(proposed, next, new Date()); } catch (error) {
        if (error instanceof WaitlistError) return false;
        throw error;
      }
    }
  }
  synchronizeWaitlistReservations(proposed);
  return true;
}
