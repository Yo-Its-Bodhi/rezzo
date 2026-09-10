import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isTimeAvailable, type Occupancy } from "@/lib/availability";
import { getRestaurantState } from "@/lib/state-store";
import { reservationTableIds, RESTAURANT_TIMEZONE } from "@/lib/restaurant";
import { serviceSlots } from "@/lib/service-slots";
import { isOnlineBookingPausedForDay } from "@/lib/booking-pause";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(6),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date"),
    partySize: url.searchParams.get("partySize"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid date and party size." }, { status: 400 });
  }
  const state = await getRestaurantState();
  const occupancies: Occupancy[] = state.reservations
    .filter((reservation) => !reservation.archivedAt)
    .flatMap((reservation) => reservationTableIds(reservation).map((tableId) => ({
      reservationId: reservation.id,
      tableId,
      startsAt: new Date(reservation.startsAt),
      endsAt: new Date(reservation.endsAt),
      status: reservation.status,
    })));
  const blocks = [
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
  ];
  const tables = state.tables.filter((table) => table.reservable);
  const now = new Date();
  const paused = isOnlineBookingPausedForDay(state.operations, parsed.data.date);
  const slots = serviceSlots(parsed.data.date).map((startsAt) => ({
    startsAt: startsAt.toISOString(),
    label: formatInTimeZone(startsAt, RESTAURANT_TIMEZONE, "h:mm a"),
    available:
      startsAt > now &&
      !paused &&
      isTimeAvailable({
        startsAt,
        partySize: parsed.data.partySize,
        tables,
        occupancies,
        blocks,
        config: {
          durationMinutes: 120,
          startsPerClockHour: 3,
          timezone: RESTAURANT_TIMEZONE,
        },
      }),
  }));
  return NextResponse.json({
    slots,
    paused,
  });
}
