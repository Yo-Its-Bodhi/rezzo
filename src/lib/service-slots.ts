import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { RESTAURANT_TIMEZONE, SERVICE_SCHEDULE } from "./restaurant";

export function serviceSlots(date: string) {
  const day = Number(formatInTimeZone(fromZonedTime(`${date}T12:00:00`, RESTAURANT_TIMEZONE), RESTAURANT_TIMEZONE, "i")) % 7;
  const schedule = SERVICE_SCHEDULE[day];
  const opening = fromZonedTime(
    `${date}T${schedule.firstReservation}:00`,
    RESTAURANT_TIMEZONE,
  );
  const finalStart = fromZonedTime(
    `${date}T${schedule.lastReservation}:00`,
    RESTAURANT_TIMEZONE,
  );
  const slots: Date[] = [];
  for (let slot = opening; slot <= finalStart; slot = addMinutes(slot, 15)) slots.push(slot);
  return slots;
}

export function isServiceStart(startsAt: Date) {
  const date = formatInTimeZone(startsAt, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
  return serviceSlots(date).some((slot) => slot.getTime() === startsAt.getTime());
}
