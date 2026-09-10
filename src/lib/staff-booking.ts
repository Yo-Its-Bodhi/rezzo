import { addHours } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { isServiceStart } from "./service-slots";
import {
  RESTAURANT_TIMEZONE,
  reservationTableIds,
  type FloorTable,
  type StoredReservation,
} from "./restaurant";

export function staffBookingRuleExceptions({
  startsAt,
  partySize,
  tableId,
  tables,
  reservations,
}: {
  startsAt: Date;
  partySize: number;
  tableId: string;
  tables: FloorTable[];
  reservations: StoredReservation[];
}) {
  const exceptions: string[] = [];
  const table = tables.find((item) => item.id === tableId);
  const currentReservations = reservations.filter((reservation) => !reservation.archivedAt);
  const activeReservations = currentReservations.filter(
    (reservation) => !["cancelled", "completed", "no_show"].includes(reservation.status),
  );
  const pacedReservations = currentReservations.filter(
    (reservation) => !["cancelled", "no_show"].includes(reservation.status),
  );

  if (partySize > 6) exceptions.push("party exceeds the normal six-person maximum");
  if (!isServiceStart(startsAt)) exceptions.push("time is outside normal reservation hours");
  if (!tableId) {
    exceptions.push("reservation has no table assignment");
  } else if (!table) {
    exceptions.push("selected table no longer exists");
  } else {
    if (!table.reservable) exceptions.push(`table ${table.name} is reserved for walk-ins`);
    if (partySize > table.capacity) exceptions.push(`party exceeds table ${table.name}'s capacity`);
    if (
      activeReservations.some(
        (reservation) =>
          reservationTableIds(reservation).includes(tableId) &&
          new Date(reservation.startsAt) < addHours(startsAt, 2) &&
          new Date(reservation.endsAt) > startsAt,
      )
    ) {
      exceptions.push(`table ${table.name} already has an overlapping booking`);
    }
  }

  const clockHour = formatInTimeZone(startsAt, RESTAURANT_TIMEZONE, "yyyy-MM-dd HH");
  const startsInHour = pacedReservations.filter(
    (reservation) =>
      formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "yyyy-MM-dd HH") ===
      clockHour,
  ).length;
  if (startsInHour >= 3) exceptions.push("clock hour already has three reservation starts");

  return exceptions;
}

export function staffReservationEditRuleExceptions({
  original,
  startsAt,
  partySize,
  tableIds,
  tables,
  reservations,
}: {
  original: StoredReservation;
  startsAt: Date;
  partySize: number;
  tableIds: string[];
  tables: FloorTable[];
  reservations: StoredReservation[];
}) {
  const exceptions: string[] = [];
  const originalStartsAt = new Date(original.startsAt);
  const originalTableIds = reservationTableIds(original);
  const timeChanged = startsAt.getTime() !== originalStartsAt.getTime();
  const partyChanged = partySize !== original.partySize;
  const assignmentsChanged =
    tableIds.length !== originalTableIds.length ||
    tableIds.some((tableId) => !originalTableIds.includes(tableId));

  if (!timeChanged && !partyChanged && !assignmentsChanged) return exceptions;

  if (partySize > 6 && partySize > original.partySize) {
    exceptions.push("party exceeds the normal six-person maximum");
  }
  if (timeChanged && !isServiceStart(startsAt)) {
    exceptions.push("time is outside normal reservation hours");
  }
  if (assignmentsChanged && tableIds.length === 0) {
    exceptions.push("reservation has no table assignment");
  }
  if (tableIds.length > originalTableIds.length && tableIds.length > 1) {
    exceptions.push("reservation uses multiple tables");
  }

  const selectedTables = tableIds.map((tableId) => tables.find((table) => table.id === tableId));
  if (selectedTables.some((table) => !table)) {
    exceptions.push("a selected table no longer exists");
  }
  const newlyAddedWalkInTable = selectedTables.some(
    (table) => table && !table.reservable && !originalTableIds.includes(table.id),
  );
  if (newlyAddedWalkInTable) exceptions.push("a selected table is reserved for walk-ins");

  const originalCapacity = originalTableIds.reduce(
    (sum, tableId) => sum + (tables.find((table) => table.id === tableId)?.capacity ?? 0),
    0,
  );
  const selectedCapacity = selectedTables.reduce(
    (sum, table) => sum + (table?.capacity ?? 0),
    0,
  );
  const originalDeficit = Math.max(0, original.partySize - originalCapacity);
  const selectedDeficit = Math.max(0, partySize - selectedCapacity);
  if ((partyChanged || assignmentsChanged) && selectedDeficit > originalDeficit) {
    exceptions.push(`assigned tables seat ${selectedCapacity}, below the ${partySize}-person party`);
  }

  if (timeChanged || assignmentsChanged) {
    const endsAt = addHours(startsAt, 2);
    for (const table of selectedTables) {
      if (
        table &&
        reservations.some(
          (reservation) =>
            !reservation.archivedAt &&
            !["cancelled", "completed", "no_show"].includes(reservation.status) &&
            reservationTableIds(reservation).includes(table.id) &&
            new Date(reservation.startsAt) < endsAt &&
            new Date(reservation.endsAt) > startsAt,
        )
      ) {
        exceptions.push(`table ${table.name} already has an overlapping booking`);
      }
    }
  }

  if (timeChanged) {
    const clockHour = formatInTimeZone(startsAt, RESTAURANT_TIMEZONE, "yyyy-MM-dd HH");
    const startsInHour = reservations.filter(
      (reservation) =>
        !reservation.archivedAt &&
        !["cancelled", "no_show"].includes(reservation.status) &&
        formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "yyyy-MM-dd HH") ===
          clockHour,
    ).length;
    if (startsInHour >= 3) exceptions.push("clock hour already has three reservation starts");
  }

  return [...new Set(exceptions)];
}
