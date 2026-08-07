export const RESTAURANT_TIMEZONE = "America/Toronto";
export const RESERVATION_STORAGE_KEY = "la-chingada-reservations";
export const WAITLIST_STORAGE_KEY = "la-chingada-waitlist";
export const OPERATIONS_STORAGE_KEY = "la-chingada-operations";
export const FLOOR_LAYOUT_STORAGE_KEY = "la-chingada-floor-layout";
const FLOOR_LAYOUT_VERSION_KEY = "la-chingada-floor-layout-version";
const FLOOR_LAYOUT_VERSION = "2";

export type FloorName = "front" | "back" | "patio";
export type FloorTable = {
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  shape: "round" | "square" | "long";
  floor: FloorName;
  reservable: boolean;
};

export const DEFAULT_TABLES: FloorTable[] = [
  { id: "t11", name: "11", capacity: 4, x: 14, y: 82, shape: "square", floor: "front", reservable: true },
  { id: "t12", name: "12", capacity: 6, x: 14, y: 64, shape: "long", floor: "front", reservable: true },
  { id: "t13", name: "13", capacity: 4, x: 14, y: 46, shape: "square", floor: "front", reservable: true },
  { id: "t14", name: "14", capacity: 4, x: 14, y: 28, shape: "square", floor: "front", reservable: true },
  { id: "t15", name: "15", capacity: 4, x: 14, y: 10, shape: "square", floor: "front", reservable: true },
  { id: "t16", name: "16", capacity: 4, x: 82, y: 64, shape: "square", floor: "front", reservable: true },
  { id: "t17", name: "17", capacity: 4, x: 82, y: 82, shape: "square", floor: "front", reservable: true },
  { id: "t31", name: "31", capacity: 4, x: 13, y: 41, shape: "square", floor: "back", reservable: true },
  { id: "t32", name: "32", capacity: 4, x: 13, y: 15, shape: "square", floor: "back", reservable: true },
  { id: "t33", name: "33", capacity: 6, x: 40, y: 15, shape: "long", floor: "back", reservable: true },
  { id: "t34", name: "34", capacity: 6, x: 80, y: 15, shape: "long", floor: "back", reservable: true },
  { id: "t35", name: "35", capacity: 6, x: 80, y: 41, shape: "long", floor: "back", reservable: true },
  { id: "t36", name: "36", capacity: 6, x: 40, y: 41, shape: "long", floor: "back", reservable: true },
  ...Array.from({ length: 13 }, (_, index) => ({
    id: `t${41 + index}`,
    name: String(41 + index),
    capacity: 1,
    x: index < 3 ? 12 : 20 + (index - 3) * 7.4,
    y: index < 3 ? 68 + index * 10 : 68,
    shape: "square" as const,
    floor: "back" as const,
    reservable: false,
  })),
  { id: "t1", name: "1", capacity: 4, x: 14, y: 80, shape: "square", floor: "patio", reservable: false },
  { id: "t2", name: "2", capacity: 4, x: 14, y: 60, shape: "square", floor: "patio", reservable: false },
  { id: "t3", name: "3", capacity: 4, x: 14, y: 40, shape: "square", floor: "patio", reservable: false },
  { id: "t4", name: "4", capacity: 4, x: 14, y: 16, shape: "square", floor: "patio", reservable: false },
  { id: "t5", name: "5", capacity: 4, x: 45, y: 16, shape: "square", floor: "patio", reservable: false },
  { id: "t6", name: "6", capacity: 4, x: 45, y: 40, shape: "square", floor: "patio", reservable: false },
  { id: "t7", name: "7", capacity: 4, x: 45, y: 60, shape: "square", floor: "patio", reservable: false },
  { id: "t8", name: "8", capacity: 6, x: 78, y: 80, shape: "long", floor: "patio", reservable: false },
  { id: "t9", name: "9", capacity: 6, x: 78, y: 60, shape: "long", floor: "patio", reservable: false },
  { id: "t10", name: "10", capacity: 6, x: 78, y: 40, shape: "long", floor: "patio", reservable: false },
];

export const TABLES = DEFAULT_TABLES;

export const SERVICE_SCHEDULE: Record<number, { opens: string; closes: string }> = {
  0: { opens: "12:00", closes: "21:00" },
  1: { opens: "16:00", closes: "22:00" },
  2: { opens: "16:00", closes: "22:00" },
  3: { opens: "16:00", closes: "22:00" },
  4: { opens: "12:00", closes: "23:00" },
  5: { opens: "12:00", closes: "23:00" },
  6: { opens: "12:00", closes: "23:00" },
};

export type StoredReservation = {
  id: string;
  confirmationCode: string;
  guestName: string;
  email: string;
  phone: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  tableId: string;
  status: "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "no_show";
  source: "online" | "phone" | "staff" | "waitlist";
  request?: string;
  policyVersion: number;
  policyAcceptedAt: string;
};

export type StoredWaitlistEntry = {
  id: string;
  guestName: string;
  phone: string;
  email: string;
  partySize: number;
  notes?: string;
  joinedAt: string;
  status: "waiting" | "offered" | "accepted" | "declined" | "expired";
  offerExpiresAt?: string;
};

export type StoredOperations = {
  onlineBookingPaused: boolean;
  blockedTableIds: string[];
  tableHolds: TableHold[];
};

export type TableHold = {
  id: string;
  tableId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

export const RESERVATION_POLICIES = [
  "Maximum of 6 people per online booking. For larger parties, contact us directly.",
  "Parties of 6 are subject to one bill and an 18% auto-gratuity.",
  "The patio is first come, first sat and cannot be reserved.",
  "We do not book multiple tables for the same reservation.",
  "We seat parties when at least 50% of the reservation is present.",
  "Tables are reserved for two hours.",
  "Changes must be made at least 24 hours in advance.",
  "Reservations are held for 15 minutes before they may be released.",
];

export function readStoredReservations(): StoredReservation[] {
  if (typeof window === "undefined") return [];
  const value = window.localStorage.getItem(RESERVATION_STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as StoredReservation[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredReservations(reservations: StoredReservation[]) {
  window.localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(reservations));
  window.dispatchEvent(new Event("rezzo:reservations"));
}

export function readStoredWaitlist(): StoredWaitlistEntry[] {
  if (typeof window === "undefined") return [];
  const value = window.localStorage.getItem(WAITLIST_STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as StoredWaitlistEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredWaitlist(entries: StoredWaitlistEntry[]) {
  window.localStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("rezzo:waitlist"));
}

export function readStoredOperations(): StoredOperations {
  if (typeof window === "undefined") {
    return { onlineBookingPaused: false, blockedTableIds: [], tableHolds: [] };
  }
  const value = window.localStorage.getItem(OPERATIONS_STORAGE_KEY);
  if (!value) return { onlineBookingPaused: false, blockedTableIds: [], tableHolds: [] };
  try {
    const parsed = JSON.parse(value) as Partial<StoredOperations>;
    return {
      onlineBookingPaused: parsed.onlineBookingPaused === true,
      blockedTableIds: Array.isArray(parsed.blockedTableIds) ? parsed.blockedTableIds : [],
      tableHolds: Array.isArray(parsed.tableHolds) ? parsed.tableHolds : [],
    };
  } catch {
    return { onlineBookingPaused: false, blockedTableIds: [], tableHolds: [] };
  }
}

export function writeStoredOperations(operations: StoredOperations) {
  window.localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(operations));
  window.dispatchEvent(new Event("rezzo:operations"));
}

export function readStoredFloorLayout(): FloorTable[] {
  if (typeof window === "undefined") return DEFAULT_TABLES;
  if (window.localStorage.getItem(FLOOR_LAYOUT_VERSION_KEY) !== FLOOR_LAYOUT_VERSION) {
    window.localStorage.setItem(FLOOR_LAYOUT_VERSION_KEY, FLOOR_LAYOUT_VERSION);
    window.localStorage.setItem(FLOOR_LAYOUT_STORAGE_KEY, JSON.stringify(DEFAULT_TABLES));
    return DEFAULT_TABLES;
  }
  const value = window.localStorage.getItem(FLOOR_LAYOUT_STORAGE_KEY);
  if (!value) return DEFAULT_TABLES;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as FloorTable[]) : DEFAULT_TABLES;
  } catch {
    return DEFAULT_TABLES;
  }
}

export function writeStoredFloorLayout(tables: FloorTable[]) {
  window.localStorage.setItem(FLOOR_LAYOUT_VERSION_KEY, FLOOR_LAYOUT_VERSION);
  window.localStorage.setItem(FLOOR_LAYOUT_STORAGE_KEY, JSON.stringify(tables));
  window.dispatchEvent(new Event("rezzo:floor-layout"));
}

export function resetStoredFloorLayout() {
  window.localStorage.removeItem(FLOOR_LAYOUT_STORAGE_KEY);
  window.localStorage.removeItem(FLOOR_LAYOUT_VERSION_KEY);
  window.dispatchEvent(new Event("rezzo:floor-layout"));
}
