export const RESTAURANT_TIMEZONE = "America/Toronto";

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

export type FloorFixture = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  floor: FloorName;
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

export const DEFAULT_FIXTURES: FloorFixture[] = [
  { id: "front-entry", label: "ENTRANCE", x: 45, y: 93, width: 22, height: 6, floor: "front" },
  { id: "host-stand", label: "HOST STAND", x: 67, y: 81, width: 18, height: 9, floor: "front" },
  { id: "back-bar", label: "BAR · WALK-INS", x: 55, y: 81, width: 62, height: 10, floor: "back" },
  { id: "back-kitchen", label: "TO KITCHEN", x: 88, y: 50, width: 15, height: 8, floor: "back" },
  { id: "patio-tree", label: "TREE", x: 76, y: 18, width: 14, height: 14, floor: "patio" },
  { id: "patio-entry", label: "ENTRANCE", x: 50, y: 93, width: 22, height: 6, floor: "patio" },
];

export const SERVICE_SCHEDULE: Record<
  number,
  { firstReservation: string; lastReservation: string }
> = {
  0: { firstReservation: "12:00", lastReservation: "20:00" },
  1: { firstReservation: "16:00", lastReservation: "21:00" },
  2: { firstReservation: "16:00", lastReservation: "21:00" },
  3: { firstReservation: "16:00", lastReservation: "21:00" },
  4: { firstReservation: "12:00", lastReservation: "22:00" },
  5: { firstReservation: "12:00", lastReservation: "22:00" },
  6: { firstReservation: "12:00", lastReservation: "22:00" },
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
  tableIds?: string[];
  status: "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "no_show";
  source: "online" | "phone" | "staff" | "walkin" | "waitlist";
  request?: string;
  staffNote?: string;
  vip?: boolean;
  allergies?: string;
  accessibility?: string;
  occasion?: string;
  overrideReason?: string;
  archivedAt?: string;
  guestAction?: "edited" | "cancelled";
  guestActionAt?: string;
  policyVersion: number;
  policyAcceptedAt: string;
};

export function reservationTableIds(reservation: Pick<StoredReservation, "tableId" | "tableIds">) {
  return [...new Set([...(reservation.tableIds ?? []), reservation.tableId].filter(Boolean))];
}

export type StoredWaitlistEntry = {
  id: string;
  guestName: string;
  phone: string;
  email: string;
  partySize: number;
  notes?: string;
  joinedAt: string;
  status: import("./waitlist-types").WaitlistStatus;
  credentialNonce?: string;
  tokenHash?: string;
  consentAt?: string;
  upNextAt?: string;
  requeuedAt?: string;
  offerId?: string;
  offerTableId?: string;
  reservationId?: string;
  arrivalDeadline?: string;
  pushSubscription?: import("./waitlist-types").WaitlistPushSubscription;
  pushEnabled?: boolean;
  lastDelivery?: import("./waitlist-types").WaitlistDelivery;
  offerExpiresAt?: string;
};

export type StoredOperations = {
  onlineBookingPaused: boolean;
  onlineBookingPausedForDate?: string;
  blockedTableIds: string[];
  tableHolds: TableHold[];
  fixtures: FloorFixture[];
  serviceNotes?: Record<string, string>;
};

export type TableHold = {
  id: string;
  tableId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  waitlistEntryId?: string;
  expiresAt?: string;
};

export const RESERVATION_POLICIES = [
  "Maximum of 6 people per online booking. For larger parties, contact us directly.",
  "Parties of 6 are subject to one bill and an 18% auto-gratuity.",
  "The patio is first come, first sat and cannot be reserved.",
  "Multiple bookings mean separate tables. We cannot combine them into one large table or guarantee that they will be together.",
  "We seat parties when at least 50% of the reservation is present.",
  "Tables are reserved for two hours.",
  "Changes must be made at least 24 hours in advance.",
  "Reservations are held for 15 minutes before they may be released.",
];

export const RESERVATION_POLICY_NOTE =
  "We love celebrating with you and will always do our best to accommodate your needs. Because La Chingada is a small restaurant with a limited number of tables, we may not be the right fit for every large gathering—and it is never personal. Happy hour and prime-time availability may also be limited when demand is high. These policies help us provide the fairest and best possible experience for every guest. Thank you for understanding.";
