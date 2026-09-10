import { addHours, differenceInHours } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assignBestTable } from "@/lib/availability";
import { reservationTableIds, RESTAURANT_TIMEZONE } from "@/lib/restaurant";
import { isServiceStart } from "@/lib/service-slots";
import { getRestaurantState, withLockedRestaurantState } from "@/lib/state-store";
import { isOnlineBookingPausedForDate } from "@/lib/booking-pause";

const lookupSchema = z.object({
  code: z.string().trim().min(4).max(32).transform((value) => value.toUpperCase()),
  contact: z.string().trim().min(7).max(200),
});

const changeSchema = lookupSchema.and(
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("cancel") }),
    z.object({
      action: z.literal("edit"),
      partySize: z.number().int().min(1).max(6),
      startsAt: z.iso.datetime(),
      request: z.string().trim().max(1000).optional(),
    }),
  ]),
);

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function matchesLookup(
  reservation: { confirmationCode: string; email: string; phone: string },
  lookup: z.infer<typeof lookupSchema>,
) {
  if (reservation.confirmationCode.toUpperCase() !== lookup.code) return false;
  const contact = lookup.contact.toLowerCase();
  return reservation.email.toLowerCase() === contact ||
    (normalizePhone(contact).length >= 7 &&
      normalizePhone(reservation.phone) === normalizePhone(contact));
}

export async function POST(request: Request) {
  const parsed = lookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter valid booking details." }, { status: 400 });
  }
  const state = await getRestaurantState();
  const reservation = state.reservations.find((item) => matchesLookup(item, parsed.data));
  if (!reservation) {
    return NextResponse.json({ error: "We could not match those booking details." }, { status: 404 });
  }
  return NextResponse.json({ reservation });
}

export async function PATCH(request: Request) {
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter valid booking details." }, { status: 400 });
  }
  const outcome = await withLockedRestaurantState((state) => {
    const reservation = state.reservations.find((item) => matchesLookup(item, parsed.data));
    if (!reservation || reservation.status !== "confirmed") return { status: "not_found" as const };
    if (differenceInHours(new Date(reservation.startsAt), new Date()) < 24) {
      return { status: "cutoff" as const };
    }
    if (parsed.data.action === "cancel") {
      reservation.status = "cancelled";
      reservation.archivedAt = new Date().toISOString();
      reservation.guestAction = "cancelled";
      reservation.guestActionAt = new Date().toISOString();
      return { status: "cancelled" as const, reservation };
    }

    const startsAt = new Date(parsed.data.startsAt);
    if (differenceInHours(startsAt, new Date()) < 24) return { status: "new_cutoff" as const };
    if (!isServiceStart(startsAt)) return { status: "outside_service" as const };
    if (isOnlineBookingPausedForDate(state.operations, startsAt)) {
      return { status: "paused" as const };
    }

    const table = assignBestTable({
      startsAt,
      partySize: parsed.data.partySize,
      tables: state.tables.filter((item) => item.reservable),
      occupancies: state.reservations
        .filter((item) => item.id !== reservation.id && !item.archivedAt)
        .flatMap((item) => reservationTableIds(item).map((tableId) => ({
          reservationId: item.id,
          tableId,
          startsAt: new Date(item.startsAt),
          endsAt: new Date(item.endsAt),
          status: item.status,
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
    if (!table) return { status: "unavailable" as const };

    reservation.partySize = parsed.data.partySize;
    reservation.startsAt = startsAt.toISOString();
    reservation.endsAt = addHours(startsAt, 2).toISOString();
    reservation.tableId = table.id;
    reservation.tableIds = [table.id];
    reservation.request = parsed.data.request || undefined;
    reservation.guestAction = "edited";
    reservation.guestActionAt = new Date().toISOString();
    return { status: "edited" as const, reservation };
  }, (result) => ["cancelled", "edited"].includes(result.status));
  if (outcome.result.status === "cutoff") {
    return NextResponse.json({ error: "This booking is within the 24-hour cutoff." }, { status: 409 });
  }
  if (outcome.result.status === "not_found") {
    return NextResponse.json({ error: "The booking is not active." }, { status: 404 });
  }
  if (outcome.result.status === "new_cutoff") {
    return NextResponse.json({ error: "Choose a new time at least 24 hours away." }, { status: 409 });
  }
  if (outcome.result.status === "outside_service") {
    return NextResponse.json({ error: "That time is outside reservation hours." }, { status: 400 });
  }
  if (outcome.result.status === "paused") {
    return NextResponse.json(
      { error: "Online changes for today are paused. Please call the restaurant." },
      { status: 409 },
    );
  }
  if (outcome.result.status === "unavailable") {
    return NextResponse.json(
      { error: "That party size or time is no longer available. Try another option." },
      { status: 409 },
    );
  }
  return NextResponse.json({ reservation: outcome.result.reservation });
}
