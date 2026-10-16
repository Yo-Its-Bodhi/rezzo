import { formatInTimeZone } from "date-fns-tz";
import { RESTAURANT_TIMEZONE } from "./restaurant";

/** Date-input values follow the restaurant's calendar, including for travellers. */
export function restaurantDate(offset = 0, now = new Date()) {
  const today = formatInTimeZone(now, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
