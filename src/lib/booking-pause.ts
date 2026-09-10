import { formatInTimeZone } from "date-fns-tz";
import { RESTAURANT_TIMEZONE, type StoredOperations } from "./restaurant";

export function bookingServiceDay(date: Date) {
  return formatInTimeZone(date, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
}

export function isOnlineBookingPausedForDay(
  operations: Pick<StoredOperations, "onlineBookingPaused" | "onlineBookingPausedForDate">,
  serviceDay: string,
) {
  return (
    operations.onlineBookingPaused &&
    operations.onlineBookingPausedForDate === serviceDay
  );
}

export function isOnlineBookingPausedForDate(
  operations: Pick<StoredOperations, "onlineBookingPaused" | "onlineBookingPausedForDate">,
  date: Date,
) {
  return isOnlineBookingPausedForDay(operations, bookingServiceDay(date));
}
