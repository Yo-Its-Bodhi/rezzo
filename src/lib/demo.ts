import "server-only";

import { addHours, addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  RESTAURANT_TIMEZONE,
  type StoredReservation,
  type StoredWaitlistEntry,
} from "@/lib/restaurant";
import {
  defaultRestaurantState,
  normalizeRestaurantState,
  type RestaurantState,
  type VersionedRestaurantState,
} from "@/lib/state";

declare global {
  var __rezzoDemoState: VersionedRestaurantState | undefined;
}

export function isDemoMode() {
  return process.env.NODE_ENV !== "production" && process.env.REZZO_DEMO_MODE === "true";
}

function reservation(
  id: string,
  guestName: string,
  partySize: number,
  startsAt: Date,
  tableId: string,
  status: StoredReservation["status"],
  source: StoredReservation["source"] = "online",
  details: Partial<StoredReservation> = {},
): StoredReservation {
  return {
    id,
    confirmationCode: `DEMO-${id.toUpperCase()}`,
    guestName,
    phone: "(416) 555-0100",
    email: `${id}@example.com`,
    partySize,
    startsAt: startsAt.toISOString(),
    endsAt: addHours(startsAt, 2).toISOString(),
    tableId,
    tableIds: tableId ? [tableId] : [],
    status,
    source,
    policyVersion: 1,
    policyAcceptedAt: addHours(startsAt, -24).toISOString(),
    ...details,
  };
}

function createDemoState(): RestaurantState {
  const now = new Date();
  const todayKey = formatInTimeZone(now, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
  const defaults = defaultRestaurantState();
  const reservations: StoredReservation[] = [
    reservation("maya", "Maya Chen", 4, addMinutes(now, -45), "t11", "seated", "online", {
      vip: true,
      occasion: "Birthday",
      staffNote: "Birthday candle after mains.",
    }),
    reservation("walkin", "WALK-IN", 2, addMinutes(now, -20), "t13", "seated", "walkin", {
      phone: "",
      email: "",
      staffNote: "Quick-seated walk-in",
    }),
    reservation("jordan", "Jordan Lee", 6, addMinutes(now, -10), "t12", "arrived", "phone", {
      accessibility: "Wheelchair space required",
    }),
    reservation("sofia", "Sofia Martinez", 4, addMinutes(now, 30), "t16", "confirmed", "online", {
      allergies: "Peanut allergy",
    }),
    reservation("noah", "Noah Williams", 4, addMinutes(now, 65), "t17", "confirmed", "staff"),
    reservation("amira", "Amira Patel", 6, addMinutes(now, 105), "t33", "confirmed", "online", {
      request: "Quiet table if possible.",
    }),
    reservation("tomorrow", "Tomorrow Test", 4, addHours(now, 24), "t31", "confirmed", "online"),
  ];
  const waitlist: StoredWaitlistEntry[] = [
    {
      id: "demo-waitlist",
      guestName: "Alex Morgan",
      phone: "(416) 555-0199",
      email: "alex@example.com",
      partySize: 3,
      notes: "Bar seating is fine.",
      joinedAt: addMinutes(now, -12).toISOString(),
      status: "waiting",
    },
  ];

  return {
    ...defaults,
    reservations,
    waitlist,
    operations: {
      ...defaults.operations,
      blockedTableIds: ["t15"],
      tableHolds: [
        {
          id: "demo-hold",
          tableId: "t14",
          startsAt: addMinutes(now, -15).toISOString(),
          endsAt: addMinutes(now, 75).toISOString(),
          reason: "Held for walk-ins",
        },
      ],
      serviceNotes: {
        [todayKey]: "DEMO SHIFT · Watch the peanut allergy at table 16 and wheelchair space for Jordan.",
      },
    },
  };
}

export function getDemoRestaurantState(): VersionedRestaurantState {
  globalThis.__rezzoDemoState ??= { ...createDemoState(), revision: 1 };
  return globalThis.__rezzoDemoState;
}

export function replaceDemoRestaurantState(
  state: RestaurantState,
  expectedRevision: number,
): VersionedRestaurantState | null {
  const current = getDemoRestaurantState();
  if (current.revision !== expectedRevision) return null;
  globalThis.__rezzoDemoState = {
    ...normalizeRestaurantState(structuredClone(state)),
    revision: current.revision + 1,
  };
  return globalThis.__rezzoDemoState;
}

export function updateDemoRestaurantState(state: RestaurantState): VersionedRestaurantState {
  const current = getDemoRestaurantState();
  globalThis.__rezzoDemoState = {
    ...normalizeRestaurantState(structuredClone(state)),
    revision: current.revision + 1,
  };
  return globalThis.__rezzoDemoState;
}
