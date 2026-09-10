import {
  DEFAULT_FIXTURES,
  DEFAULT_TABLES,
  type FloorTable,
  type StoredOperations,
  type StoredReservation,
  type StoredWaitlistEntry,
} from "@/lib/restaurant";

export type RestaurantState = {
  reservations: StoredReservation[];
  waitlist: StoredWaitlistEntry[];
  operations: StoredOperations;
  tables: FloorTable[];
};

export type VersionedRestaurantState = RestaurantState & { revision: number };

export function defaultRestaurantState(): RestaurantState {
  return {
    reservations: [],
    waitlist: [],
    operations: {
      onlineBookingPaused: false,
      onlineBookingPausedForDate: undefined,
      blockedTableIds: [],
      tableHolds: [],
      fixtures: DEFAULT_FIXTURES.map((fixture) => ({ ...fixture })),
      serviceNotes: {},
    },
    tables: DEFAULT_TABLES.map((table) => ({ ...table })),
  };
}

export function normalizeRestaurantState(value: unknown): RestaurantState {
  const fallback = defaultRestaurantState();
  if (!value || typeof value !== "object") return fallback;
  const state = value as Partial<RestaurantState>;
  return {
    reservations: Array.isArray(state.reservations) ? state.reservations : [],
    waitlist: Array.isArray(state.waitlist) ? state.waitlist : [],
    operations: {
      onlineBookingPaused: state.operations?.onlineBookingPaused === true,
      onlineBookingPausedForDate:
        typeof state.operations?.onlineBookingPausedForDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(state.operations.onlineBookingPausedForDate)
          ? state.operations.onlineBookingPausedForDate
          : undefined,
      blockedTableIds: Array.isArray(state.operations?.blockedTableIds)
        ? state.operations.blockedTableIds
        : [],
      tableHolds: Array.isArray(state.operations?.tableHolds) ? state.operations.tableHolds : [],
      fixtures: Array.isArray(state.operations?.fixtures)
        ? state.operations.fixtures
        : fallback.operations.fixtures,
      serviceNotes:
        state.operations?.serviceNotes &&
        typeof state.operations.serviceNotes === "object" &&
        !Array.isArray(state.operations.serviceNotes)
          ? state.operations.serviceNotes
          : {},
    },
    tables: Array.isArray(state.tables) ? state.tables : fallback.tables,
  };
}
