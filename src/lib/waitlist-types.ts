export const OFFER_MS = 5 * 60_000;
export const ARRIVAL_MS = 15 * 60_000;
export const TURN_MS = 120 * 60_000;

export type WaitlistStatus =
  | "waiting" | "offered" | "accepted" | "declined" | "expired" | "seated" | "removed";

export type WaitlistTicket = {
  id: string;
  guestName: string;
  partySize: number;
  status: WaitlistStatus;
  joinedAt: string;
  position: number | null;
  aheadCount: number;
  upNextAt?: string;
  offerId?: string;
  offerExpiresAt?: string;
  tableName?: string;
  reservationCode?: string;
  arrivalDeadline?: string;
  serverNow: string;
  pushEnabled: boolean;
};

export type WaitlistPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type WaitlistDelivery = {
  channel: "push" | "sms";
  sent: boolean;
  error?: string;
};

export type WaitlistStaffAction = "up_next" | "offer" | "remove" | "seat" | "requeue";
