import { formatInTimeZone } from "date-fns-tz";

export type DiningTable = {
  id: string;
  name: string;
  capacity: number;
  active?: boolean;
  reservable?: boolean;
};

export type Occupancy = {
  reservationId?: string;
  tableId: string;
  startsAt: Date;
  endsAt: Date;
  status?: "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "no_show";
};

export type TableBlock = {
  tableId: string;
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityConfig = {
  durationMinutes: number;
  startsPerClockHour: number;
  timezone: string;
};

export type HappyHourRule = {
  startsAt: Date;
  endsAt: Date;
  minTableCapacity: number;
  maxTableCapacity: number;
};

export type AvailabilityInput = {
  startsAt: Date;
  partySize: number;
  tables: DiningTable[];
  occupancies: Occupancy[];
  blocks: TableBlock[];
  config: AvailabilityConfig;
  happyHourRules?: HappyHourRule[];
};

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA < endB && endA > startB;

const countsTowardStartLimit = (status: Occupancy["status"]) =>
  status !== "cancelled" && status !== "no_show";

const occupiesTable = (status: Occupancy["status"]) =>
  status !== "cancelled" && status !== "no_show" && status !== "completed";

export function getEligibleTables({
  startsAt,
  partySize,
  tables,
  occupancies,
  blocks,
  config,
  happyHourRules = [],
}: AvailabilityInput): DiningTable[] {
  const endsAt = new Date(startsAt.getTime() + config.durationMinutes * 60_000);
  const hourKey = formatInTimeZone(startsAt, config.timezone, "yyyy-MM-dd-HH");
  const startsInHour = occupancies.filter(
    (item) =>
      countsTowardStartLimit(item.status) &&
      formatInTimeZone(item.startsAt, config.timezone, "yyyy-MM-dd-HH") === hourKey,
  );
  const startsThisHour =
    new Set(startsInHour.flatMap((item) => item.reservationId ? [item.reservationId] : [])).size +
    startsInHour.filter((item) => !item.reservationId).length;

  if (startsThisHour >= config.startsPerClockHour) return [];

  const activeHappyHourRule = happyHourRules.find((rule) =>
    overlaps(startsAt, endsAt, rule.startsAt, rule.endsAt),
  );

  return tables
    .filter(
      (table) =>
        table.active !== false &&
        table.reservable !== false &&
        table.capacity >= partySize &&
        (!activeHappyHourRule ||
          (table.capacity >= activeHappyHourRule.minTableCapacity &&
            table.capacity <= activeHappyHourRule.maxTableCapacity)),
    )
    .filter(
      (table) =>
        !occupancies.some(
          (item) =>
            item.tableId === table.id &&
            occupiesTable(item.status) &&
            overlaps(startsAt, endsAt, item.startsAt, item.endsAt),
        ),
    )
    .filter(
      (table) =>
        !blocks.some(
          (block) =>
            block.tableId === table.id &&
            overlaps(startsAt, endsAt, block.startsAt, block.endsAt),
        ),
    )
    .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
}

export function isTimeAvailable(input: AvailabilityInput): boolean {
  return getEligibleTables(input).length > 0;
}

export function assignBestTable(input: AvailabilityInput): DiningTable | null {
  return getEligibleTables(input)[0] ?? null;
}
