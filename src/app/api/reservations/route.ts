import { addHours } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assignBestTable } from "@/lib/availability";
import {
  reservationTableIds,
  RESTAURANT_TIMEZONE,
  type StoredReservation,
} from "@/lib/restaurant";
import { isServiceStart } from "@/lib/service-slots";
import { withLockedRestaurantState } from "@/lib/state-store";
import { isOnlineBookingPausedForDate } from "@/lib/booking-pause";

const bookingSchema = z.object({
  guestName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z.email().max(200),
  request: z.string().trim().max(1000).optional(),
  partySize: z.number().int().min(1).max(6),
  startsAt: z.iso.datetime(),
  policyAccepted: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check your booking details and policy consent." }, { status: 400 });
  }
  const startsAt = new Date(parsed.data.startsAt);
  if (startsAt <= new Date()) {
    return NextResponse.json({ error: "Choose a future reservation time." }, { status: 400 });
  }
  if (!isServiceStart(startsAt)) {
    return NextResponse.json({ error: "That time is outside reservation hours." }, { status: 400 });
  }

  const outcome = await withLockedRestaurantState((state) => {
    if (isOnlineBookingPausedForDate(state.operations, startsAt)) return null;
    const table = assignBestTable({
      startsAt,
      partySize: parsed.data.partySize,
      tables: state.tables.filter((item) => item.reservable),
      occupancies: state.reservations
        .filter((reservation) => !reservation.archivedAt)
        .flatMap((reservation) => reservationTableIds(reservation).map((tableId) => ({
          reservationId: reservation.id,
          tableId,
          startsAt: new Date(reservation.startsAt),
          endsAt: new Date(reservation.endsAt),
          status: reservation.status,
        }))),
      blocks: [
        ...state.operations.blockedTableIds.map((tableId) => ({
          tableId,
          startsAt: new Date(0),
          endsAt: new Date("9999-12-31T23:59:59Z"),
        })),
        ...state.operations.tableHolds.map((hold) => ({
          tableId: hold.tableId,
          startsAt: new Date(hold.startsAt),
          endsAt: new Date(hold.endsAt),
        })),
      ],
      config: {
        durationMinutes: 120,
        startsPerClockHour: 3,
        timezone: RESTAURANT_TIMEZONE,
      },
    });
    if (!table) return null;
    const confirmationCode = `LC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const reservation: StoredReservation = {
      id: crypto.randomUUID(),
      confirmationCode,
      guestName: parsed.data.guestName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      request: parsed.data.request,
      partySize: parsed.data.partySize,
      startsAt: startsAt.toISOString(),
      endsAt: addHours(startsAt, 2).toISOString(),
      tableId: table.id,
      status: "confirmed",
      source: "online",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    };
    state.reservations.push(reservation);
    return reservation;
  });
  if (!outcome.result) {
    return NextResponse.json(
      { error: "That table was just taken. Please choose another time." },
      { status: 409 },
    );
  }
  return NextResponse.json({ reservation: outcome.result }, { status: 201 });
}
