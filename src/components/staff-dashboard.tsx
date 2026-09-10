"use client";

import {
  addDays,
  addHours,
  format,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArchiveRestore,
  Ban,
  BellRing,
  CalendarPlus,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Save,
  SquarePen,
  StickyNote,
  Trash2,
  Undo2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StoredReservation,
  StoredWaitlistEntry,
  FloorName,
  FloorTable,
  FloorFixture,
  DEFAULT_TABLES,
  DEFAULT_FIXTURES,
  TableHold,
  reservationTableIds,
  RESTAURANT_TIMEZONE,
} from "@/lib/restaurant";
import { WAITLIST_ENABLED } from "@/lib/features";
import { WaitlistPanel, type WaitlistAction, type WaitlistDelivery } from "@/components/waitlist-panel";
import {
  detectReservationAlert,
  reservationSnapshot,
  type ReservationAlert,
} from "@/lib/reservation-alerts";
import type { RestaurantState, VersionedRestaurantState } from "@/lib/state";
import {
  liveTableTurns,
  minutesUntilTurnEnds,
  reservationConflictsWithTurn,
  reservationOccupiesTableAt,
  turnCountdownLabel,
  upcomingArrivals,
} from "@/lib/live-service";
import {
  staffBookingRuleExceptions,
  staffReservationEditRuleExceptions,
} from "@/lib/staff-booking";

type AdminTab = "bookings" | "calendar" | "floor" | "reports" | "waitlist";

const statusOrder: StoredReservation["status"][] = [
  "confirmed",
  "arrived",
  "seated",
  "completed",
];

function isActiveServiceReservation(reservation: StoredReservation) {
  return (
    !reservation.archivedAt &&
    ["confirmed", "arrived", "seated"].includes(reservation.status)
  );
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, "");
}

function reservationDayKey(date: Date) {
  return formatInTimeZone(date, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
}

function calendarDayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function formatRestaurant(date: Date, pattern: string) {
  return formatInTimeZone(date, RESTAURANT_TIMEZONE, pattern);
}

function submittedAsOverride(event: FormEvent<HTMLFormElement>) {
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  return (
    submitter instanceof HTMLButtonElement &&
    submitter.name === "override" &&
    submitter.value === "yes"
  );
}

function nextStatusAction(status: StoredReservation["status"]) {
  if (status === "confirmed") return "MARK ARRIVED";
  if (status === "arrived") return "SEAT PARTY";
  if (status === "seated") return "COMPLETE";
  return "";
}

export function StaffDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>("bookings");
  const [reservations, setReservations] = useState<StoredReservation[]>([]);
  const [waitlist, setWaitlist] = useState<StoredWaitlistEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [pauseDate, setPauseDate] = useState<string | undefined>();
  const [blockedTables, setBlockedTables] = useState<string[]>([]);
  const [tableHolds, setTableHolds] = useState<TableHold[]>([]);
  const [serviceNotes, setServiceNotes] = useState<Record<string, string>>({});
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [savedTables, setSavedTables] = useState<FloorTable[]>([]);
  const [fixtures, setFixtures] = useState<FloorFixture[]>([]);
  const [savedFixtures, setSavedFixtures] = useState<FloorFixture[]>([]);
  const [activeFloor, setActiveFloor] = useState<FloorName>("front");
  const [editingFloor, setEditingFloor] = useState(false);
  const [reservationToAssign, setReservationToAssign] = useState("");
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [editingReservation, setEditingReservation] = useState<StoredReservation | null>(null);
  const [reservationEditError, setReservationEditError] = useState("");
  const [reservationEditConflicts, setReservationEditConflicts] = useState<string[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedServiceDay, setSelectedServiceDay] = useState(() => new Date());
  const [floorTime, setFloorTime] = useState(() => new Date());
  const [clockNow, setClockNow] = useState(() => new Date());
  const [followNow, setFollowNow] = useState(true);
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const revisionRef = useRef(0);
  const knownReservationIdsRef = useRef<Set<string>>(new Set());
  const knownGuestActionsRef = useRef<Map<string, string>>(new Map());
  const saveInFlightRef = useRef(false);
  const defaultTitleRef = useRef("Rezzo Staff");
  const [stateError, setStateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [phoneBookingTable, setPhoneBookingTable] = useState("");
  const [phoneBookingError, setPhoneBookingError] = useState("");
  const [phoneBookingConflicts, setPhoneBookingConflicts] = useState<string[]>([]);
  const [phoneBookingStartsAt, setPhoneBookingStartsAt] = useState(() => new Date());
  const [assignmentWarning, setAssignmentWarning] = useState<{
    reservationId: string;
    messages: string[];
  } | null>(null);
  const [quickWalkInPartySize, setQuickWalkInPartySize] = useState(2);
  const [quickWalkInError, setQuickWalkInError] = useState("");
  const [showQuickWalkIn, setShowQuickWalkIn] = useState(false);
  const [reservationAlert, setReservationAlert] = useState<ReservationAlert | null>(null);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false);

  const rememberReservations = useCallback((items: StoredReservation[]) => {
    const snapshot = reservationSnapshot(items);
    knownReservationIdsRef.current = snapshot.ids;
    knownGuestActionsRef.current = snapshot.guestActions;
  }, []);

  const loadState = useCallback(async () => {
    const response = await fetch("/api/staff/state", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/staff/login");
      return false;
    }
    const payload = (await response.json()) as VersionedRestaurantState & { error?: string };
    if (!response.ok) {
      setStateError(payload.error ?? "Shared restaurant data could not be loaded.");
      setLoading(false);
      return false;
    }
    setReservations(payload.reservations);
    rememberReservations(payload.reservations);
    setWaitlist(payload.waitlist);
    setPauseDate(payload.operations.onlineBookingPausedForDate);
    setPaused(
      payload.operations.onlineBookingPaused &&
      payload.operations.onlineBookingPausedForDate === reservationDayKey(new Date()),
    );
    setBlockedTables(payload.operations.blockedTableIds);
    setTableHolds(payload.operations.tableHolds);
    setServiceNotes(payload.operations.serviceNotes ?? {});
    setFixtures(payload.operations.fixtures);
    setSavedFixtures(payload.operations.fixtures);
    setTables(payload.tables);
    setSavedTables(payload.tables);
    revisionRef.current = payload.revision;
    setLoading(false);
    return true;
  }, [rememberReservations, router]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/staff/state", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/staff/login");
          return;
        }
        const payload = (await response.json()) as VersionedRestaurantState & { error?: string };
        if (!response.ok) {
          setStateError(payload.error ?? "Shared restaurant data could not be loaded.");
          setLoading(false);
          return;
        }
        setReservations(payload.reservations);
        rememberReservations(payload.reservations);
        setWaitlist(payload.waitlist);
        setPauseDate(payload.operations.onlineBookingPausedForDate);
        setPaused(
          payload.operations.onlineBookingPaused &&
          payload.operations.onlineBookingPausedForDate === reservationDayKey(new Date()),
        );
        setBlockedTables(payload.operations.blockedTableIds);
        setTableHolds(payload.operations.tableHolds);
        setServiceNotes(payload.operations.serviceNotes ?? {});
        setFixtures(payload.operations.fixtures);
        setSavedFixtures(payload.operations.fixtures);
        setTables(payload.tables);
        setSavedTables(payload.tables);
        revisionRef.current = payload.revision;
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStateError(error instanceof Error ? error.message : "Shared restaurant data could not be loaded.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [rememberReservations, router]);

  useEffect(() => {
    if (!followNow) return;
    const timer = window.setInterval(() => setFloorTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [followNow]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setClockNow(current);
      if (paused && pauseDate !== reservationDayKey(current)) setPaused(false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [pauseDate, paused]);

  useEffect(() => {
    if (editingFloor || editingReservation || showPhoneForm) return;
    const poll = async () => {
      if (saveInFlightRef.current) return;
      const response = await fetch("/api/staff/state", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/staff/login");
        return;
      }
      if (!response.ok) return;
      const payload = (await response.json()) as VersionedRestaurantState;
      if (payload.revision <= revisionRef.current) return;
      const alert = detectReservationAlert(
        {
          ids: knownReservationIdsRef.current,
          guestActions: knownGuestActionsRef.current,
        },
        payload.reservations,
      );
      rememberReservations(payload.reservations);
      revisionRef.current = payload.revision;
      setAssignmentWarning(null);
      setReservationEditConflicts([]);
      setPhoneBookingConflicts([]);
      setReservations(payload.reservations);
      setWaitlist(payload.waitlist);
      setPauseDate(payload.operations.onlineBookingPausedForDate);
      setPaused(
        payload.operations.onlineBookingPaused &&
        payload.operations.onlineBookingPausedForDate === reservationDayKey(new Date()),
      );
      setBlockedTables(payload.operations.blockedTableIds);
      setTableHolds(payload.operations.tableHolds);
      setServiceNotes(payload.operations.serviceNotes ?? {});
      setFixtures(payload.operations.fixtures);
      setSavedFixtures(payload.operations.fixtures);
      setTables(payload.tables);
      setSavedTables(payload.tables);
      if (!alert) return;
      setReservationAlert(alert);
      const titleAction =
        alert.kind === "new" ? "NEW RESERVATION" :
        alert.kind === "edited" ? "RESERVATION CHANGED" :
        "RESERVATION CANCELLED";
      document.title = `${titleAction} (${alert.reservations.length}) · Rezzo`;
      if ("Notification" in window && Notification.permission === "granted") {
        const latest = alert.reservations.at(-1);
        new Notification(
          alert.reservations.length === 1
            ? titleAction
            : `${alert.reservations.length} ${titleAction.toLowerCase()} alerts`,
          {
            body: latest
              ? `${latest.guestName} · ${latest.partySize} guests · ${formatRestaurant(new Date(latest.startsAt), "EEE h:mm a")}`
              : "Open the Rezzo control room for details.",
          },
        );
      }
    };
    const timer = window.setInterval(() => void poll(), 10_000);
    return () => window.clearInterval(timer);
  }, [editingFloor, editingReservation, rememberReservations, router, showPhoneForm]);

  async function saveState(state: RestaurantState) {
    if (saveInFlightRef.current) {
      setStateError("Another change is still saving. Wait a moment and try again.");
      return false;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/staff/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revisionRef.current, state }),
      });
      const payload = (await response.json()) as VersionedRestaurantState & { error?: string };
      if (!response.ok) {
        setStateError(payload.error ?? "The change could not be saved.");
        if (response.status === 409) {
          setReservationEditConflicts([]);
          setPhoneBookingConflicts([]);
          setAssignmentWarning(null);
          await loadState();
        }
        return false;
      }
      revisionRef.current = payload.revision;
      setStateError("");
      return true;
    } catch (error) {
      setStateError(error instanceof Error ? error.message : "The change could not be saved. Check the connection and try again.");
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  function currentState(overrides: Partial<RestaurantState> = {}): RestaurantState {
    return {
      reservations,
      waitlist,
      operations: {
        onlineBookingPaused: paused,
        onlineBookingPausedForDate: paused ? pauseDate : undefined,
        blockedTableIds: blockedTables,
        tableHolds,
        fixtures: savedFixtures,
        serviceNotes,
      },
      tables: savedTables,
      ...overrides,
    };
  }

  const visibleReservations = useMemo(
    () =>
      reservations
        .filter((reservation) =>
          `${reservation.guestName} ${reservation.confirmationCode} ${reservation.phone}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter((reservation) =>
          showRemoved ? Boolean(reservation.archivedAt) : !reservation.archivedAt,
        )
        .filter(
          (reservation) =>
            showRemoved ||
            reservationDayKey(new Date(reservation.startsAt)) ===
              calendarDayKey(selectedServiceDay),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [query, reservations, selectedServiceDay, showRemoved],
  );
  const activeBookReservations = showRemoved
    ? visibleReservations
    : visibleReservations.filter(
        (reservation) => !["completed", "cancelled", "no_show"].includes(reservation.status),
      );
  const finishedReservations = showRemoved
    ? []
    : reservations
        .filter((reservation) => reservation.status === "completed")
        .filter(
          (reservation) =>
            reservationDayKey(new Date(reservation.startsAt)) === calendarDayKey(selectedServiceDay),
        )
        .filter((reservation) =>
          `${reservation.guestName} ${reservation.confirmationCode} ${reservation.phone}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function reservationTableNames(reservation: StoredReservation) {
    const names = reservationTableIds(reservation)
      .map((tableId) => tables.find((table) => table.id === tableId)?.name)
      .filter(Boolean);
    return names.length > 0 ? names.join(" + ") : "—";
  }

  function openReservationDay(day: Date) {
    setSelectedServiceDay(day);
    setShowRemoved(false);
    setQuery("");
    setTab("bookings");
  }

  function addReservationForDay(day: Date) {
    const serviceTime = new Date(day);
    serviceTime.setHours(18, 0, 0, 0);
    setPhoneBookingStartsAt(serviceTime);
    setPhoneBookingTable("");
    setPhoneBookingConflicts([]);
    setPhoneBookingError("");
    setShowPhoneForm(true);
  }

  function openReservationEditor(reservation: StoredReservation) {
    setReservationEditError("");
    setReservationEditConflicts([]);
    setEditingReservation(reservation);
  }

  function focusReservation(reservation: StoredReservation) {
    if (!isActiveServiceReservation(reservation)) return;
    const primaryTable = tables.find((table) => table.id === reservationTableIds(reservation)[0]);
    setFocusedReservationId(reservation.id);
    setSelectedTableId(primaryTable?.id ?? null);
    if (primaryTable) setActiveFloor(primaryTable.floor);
    setAssignmentWarning(null);
    if (reservationTableIds(reservation).length > 0) {
      setTab("floor");
    } else {
      openReservationEditor(reservation);
    }
  }

  async function saveServiceNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dayKey = format(selectedServiceDay, "yyyy-MM-dd");
    const note = String(form.get("serviceNote") ?? "").trim();
    const nextServiceNotes = { ...serviceNotes, [dayKey]: note };
    if (!note) delete nextServiceNotes[dayKey];
    const saved = await saveState(currentState({
      operations: {
        onlineBookingPaused: paused,
        onlineBookingPausedForDate: paused ? pauseDate : undefined,
        blockedTableIds: blockedTables,
        tableHolds,
        fixtures: savedFixtures,
        serviceNotes: nextServiceNotes,
      },
    }));
    if (saved) setServiceNotes(nextServiceNotes);
  }

  async function persistReservations(next: StoredReservation[]) {
    if (saveInFlightRef.current) {
      setStateError("Another change is still saving. Wait a moment and try again.");
      return false;
    }
    const saved = await saveState(currentState({ reservations: next }));
    if (!saved) return false;
    rememberReservations(next);
    setReservations(next);
    return true;
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      setStateError("This browser does not support system notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserAlertsEnabled(permission === "granted");
    if (permission !== "granted") {
      setStateError("Browser alerts were not enabled. In-app alerts will still appear.");
    }
  }

  function dismissReservationAlert() {
    setReservationAlert(null);
    document.title = defaultTitleRef.current;
  }

  async function persistOperations(
    nextPaused: boolean,
    nextBlockedTables: string[],
    nextTableHolds: TableHold[] = tableHolds,
  ) {
    if (saveInFlightRef.current) {
      setStateError("Another change is still saving. Wait a moment and try again.");
      return false;
    }
    const nextPauseDate = nextPaused ? reservationDayKey(new Date()) : undefined;
    const saved = await saveState(currentState({
      operations: {
        onlineBookingPaused: nextPaused,
        onlineBookingPausedForDate: nextPauseDate,
        blockedTableIds: nextBlockedTables,
        tableHolds: nextTableHolds,
        fixtures: savedFixtures,
        serviceNotes,
      },
    }));
    if (!saved) return false;
    setPaused(nextPaused);
    setPauseDate(nextPauseDate);
    setBlockedTables(nextBlockedTables);
    setTableHolds(nextTableHolds);
    return true;
  }

  function persistFloorLayout(next: FloorTable[]) {
    setTables(next);
  }

  async function saveFloorLayout() {
    if (saveInFlightRef.current) {
      setStateError("Another change is still saving. Wait a moment and try again.");
      return;
    }
    const nextOperations = {
      onlineBookingPaused: paused,
      onlineBookingPausedForDate: paused ? pauseDate : undefined,
      blockedTableIds: blockedTables,
      tableHolds,
      fixtures,
      serviceNotes,
    };
    if (await saveState(currentState({ tables, operations: nextOperations }))) {
      setSavedTables(tables.map((table) => ({ ...table })));
      setSavedFixtures(fixtures.map((fixture) => ({ ...fixture })));
      setEditingFloor(false);
      setSelectedFixtureId(null);
    }
  }

  function discardFloorLayout() {
    setTables(savedTables.map((table) => ({ ...table })));
    setFixtures(savedFixtures.map((fixture) => ({ ...fixture })));
    setEditingFloor(false);
    setSelectedTableId(null);
    setSelectedFixtureId(null);
  }

  async function setStatus(id: string, status: StoredReservation["status"]) {
    const target = reservations.find((reservation) => reservation.id === id);
    if (status === "seated" && target) {
      const occupiedTables = reservationTableIds(target).filter((tableId) =>
        reservations.some(
          (reservation) =>
            reservation.id !== target.id &&
            reservationTableIds(reservation).includes(tableId) &&
            reservation.status === "seated" &&
            reservationOccupiesTableAt(reservation, new Date()),
        ),
      );
      if (occupiedTables.length > 0) {
        const names = occupiedTables
          .map((tableId) => tables.find((table) => table.id === tableId)?.name ?? tableId)
          .join(", ");
        setStateError(`Cannot seat this party: table ${names} is still occupied. Complete or move the current party first.`);
        return false;
      }
    }
    return persistReservations(
      reservations.map((reservation) =>
        reservation.id === id
          ? {
              ...reservation,
              status,
              archivedAt: ["cancelled", "no_show"].includes(status)
                ? reservation.archivedAt ?? new Date().toISOString()
                : undefined,
            }
          : reservation,
      ),
    );
  }

  function advanceStatus(reservation: StoredReservation) {
    const index = statusOrder.indexOf(reservation.status);
    setStatus(reservation.id, statusOrder[Math.min(index + 1, statusOrder.length - 1)]);
  }

  function confirmStatus(
    reservation: StoredReservation,
    status: "cancelled" | "no_show",
  ) {
    const label = status === "no_show" ? "mark as a no-show" : "cancel";
    if (!window.confirm(`Are you sure you want to ${label} ${reservation.guestName}'s reservation?`)) {
      return;
    }
    void setStatus(reservation.id, status);
  }

  function restoreReservation(reservation: StoredReservation) {
    setStatus(
      reservation.id,
      reservation.status === "completed" ? "seated" : "confirmed",
    );
  }

  function archiveReservation(reservation: StoredReservation) {
    persistReservations(
      reservations.map((item) =>
        item.id === reservation.id ? { ...item, archivedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function restoreArchivedReservation(reservation: StoredReservation) {
    persistReservations(
      reservations.map((item) => {
        if (item.id !== reservation.id) return item;
        const restored = {
          ...item,
          status: ["cancelled", "no_show"].includes(item.status)
            ? "confirmed" as const
            : item.status,
        };
        delete restored.archivedAt;
        return restored;
      }),
    );
  }

  function conflictDetails(
    startsAt: Date,
    tableIds: string[],
    excludingReservationId?: string,
  ) {
    const endsAt = addHours(startsAt, 2);
    return reservations
      .filter(
        (reservation) =>
          reservation.id !== excludingReservationId &&
          reservationTableIds(reservation).some((tableId) => tableIds.includes(tableId)) &&
          reservationConflictsWithTurn(reservation, startsAt, endsAt),
      )
      .map(
        (reservation) =>
          `TABLE ${reservationTableNames(reservation)} · ${formatRestaurant(new Date(reservation.startsAt), "h:mm a")}–${formatRestaurant(new Date(reservation.endsAt), "h:mm a")} · ${reservation.guestName} · ${reservation.partySize} PEOPLE`,
      );
  }

  function operationWarnings(startsAt: Date, tableIds: string[]) {
    const endsAt = addHours(startsAt, 2);
    return tableIds.flatMap((tableId) => {
      const tableName = tables.find((table) => table.id === tableId)?.name ?? tableId;
      return [
        ...(blockedTables.includes(tableId) ? [`TABLE ${tableName} IS BLOCKED`] : []),
        ...(tableHolds.some(
          (hold) =>
            hold.tableId === tableId &&
            new Date(hold.startsAt) < endsAt &&
            new Date(hold.endsAt) > startsAt,
        )
          ? [`TABLE ${tableName} HAS A HOLD DURING THIS BOOKING`]
          : []),
      ];
    });
  }

  function warningList(ruleWarnings: string[], bookingWarnings: string[]) {
    return [
      ...ruleWarnings.filter((warning) => !warning.includes("overlapping booking")),
      ...bookingWarnings,
    ].filter((warning, index, items) => items.indexOf(warning) === index);
  }

  async function editReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingReservation) return;
    const form = new FormData(event.currentTarget);
    const startsAt = fromZonedTime(String(form.get("startsAt")), RESTAURANT_TIMEZONE);
    const partySize = Number(form.get("partySize"));
    const tableIds = form.getAll("tableIds").map(String);
    const proceedWithConflicts = submittedAsOverride(event);
    const status = String(form.get("status")) as StoredReservation["status"];
    const otherReservations = reservations.filter((item) => item.id !== editingReservation.id);
    const firstTableId = tableIds[0] ?? "";
    const exceptions = staffReservationEditRuleExceptions({
      original: editingReservation,
      startsAt,
      partySize,
      tableIds,
      tables,
      reservations: otherReservations,
    });
    const conflicts = warningList(
      [
        ...exceptions,
        ...(
          startsAt.getTime() !== new Date(editingReservation.startsAt).getTime() ||
          tableIds.join("|") !== reservationTableIds(editingReservation).join("|")
            ? operationWarnings(startsAt, tableIds)
            : []
        ),
      ],
      conflictDetails(startsAt, tableIds, editingReservation.id),
    );
    if (conflicts.length > 0 && !proceedWithConflicts) {
      setReservationEditConflicts(conflicts);
      setReservationEditError("");
      return;
    }

    const next = reservations.map((reservation) =>
      reservation.id === editingReservation.id
        ? {
            ...reservation,
            guestName: String(form.get("name")).trim(),
            phone: String(form.get("phone") ?? "").trim(),
            email: String(form.get("email") ?? "").trim(),
            partySize,
            startsAt: startsAt.toISOString(),
            endsAt: addHours(startsAt, 2).toISOString(),
            tableId: firstTableId,
            tableIds,
            status,
            archivedAt: ["cancelled", "no_show"].includes(status)
              ? reservation.archivedAt ?? new Date().toISOString()
              : undefined,
            request: String(form.get("request") ?? "").trim() || undefined,
            staffNote: String(form.get("staffNote") ?? "").trim() || undefined,
            vip: form.get("vip") === "on",
            allergies: String(form.get("allergies") ?? "").trim() || undefined,
            accessibility: String(form.get("accessibility") ?? "").trim() || undefined,
            occasion: String(form.get("occasion") ?? "").trim() || undefined,
            overrideReason: conflicts.length > 0
              ? `Staff proceeded after warning: ${conflicts.join("; ")}`
              : reservation.overrideReason,
          }
        : reservation,
    );
    if (!await persistReservations(next)) {
      setReservationEditError("Could not save. Your editor is still open—check the connection and try again.");
      return;
    }
    setEditingReservation(null);
    setReservationEditError("");
    setReservationEditConflicts([]);
  }

  async function addPhoneBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = fromZonedTime(String(form.get("startsAt")), RESTAURANT_TIMEZONE);
    const tableIds = form.getAll("tableIds").map(String);
    const tableId = tableIds[0] ?? "";
    const partySize = Number(form.get("partySize"));
    const proceedWithConflicts = submittedAsOverride(event);
    const exceptions = staffBookingRuleExceptions({
      startsAt: start,
      partySize,
      tableId,
      tables,
      reservations,
    }).filter((exception) => tableIds.length < 2 || !exception.startsWith("party exceeds table"));
    const totalCapacity = tableIds.reduce(
      (sum, id) => sum + (tables.find((table) => table.id === id)?.capacity ?? 0),
      0,
    );
    if (tableIds.length > 0 && totalCapacity < partySize) {
      exceptions.push(`assigned tables seat ${totalCapacity}, below the ${partySize}-person party`);
    }
    for (const extraTableId of tableIds.slice(1)) {
      const extraExceptions = staffBookingRuleExceptions({
        startsAt: start,
        partySize: 1,
        tableId: extraTableId,
        tables,
        reservations,
      }).filter(
        (exception) =>
          exception.includes("overlapping booking") ||
          exception.includes("reserved for walk-ins"),
      );
      exceptions.push(...extraExceptions);
    }
    const conflicts = warningList(
      [...exceptions, ...operationWarnings(start, tableIds)],
      conflictDetails(start, tableIds),
    );
    if (conflicts.length > 0 && !proceedWithConflicts) {
      setPhoneBookingConflicts(conflicts);
      setPhoneBookingError("");
      return;
    }
    const reservation: StoredReservation = {
      id: crypto.randomUUID(),
      confirmationCode: `LC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      guestName: String(form.get("name")),
      phone: String(form.get("phone") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      partySize,
      startsAt: start.toISOString(),
      endsAt: addHours(start, 2).toISOString(),
      tableId,
      tableIds,
      status: "confirmed",
      source: phoneBookingTable || proceedWithConflicts ? "staff" : "phone",
      staffNote: String(form.get("staffNote") ?? "").trim() || undefined,
      overrideReason: conflicts.length > 0
        ? `Staff proceeded after warning: ${conflicts.join("; ")}`
        : undefined,
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    };
    if (!await persistReservations([...reservations, reservation])) {
      setPhoneBookingError("Could not add the booking. This form is still open—check the connection and try again.");
      return;
    }
    setShowPhoneForm(false);
    setPhoneBookingTable("");
    setPhoneBookingError("");
    setPhoneBookingConflicts([]);
  }

  async function seatQuickWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTable) return;
    if (saveInFlightRef.current) {
      setQuickWalkInError("Another change is still saving. Wait a moment and tap Seat Now again.");
      return;
    }
    const startsAt = new Date();
    const endsAt = addHours(startsAt, 2);
    const overlappingReservation = reservations.some(
      (reservation) =>
        reservationConflictsWithTurn(reservation, startsAt, endsAt) &&
        reservationTableIds(reservation).includes(selectedTable.id),
    );
    const overlappingHold = tableHolds.some(
      (hold) =>
        hold.tableId === selectedTable.id &&
        new Date(hold.startsAt) < endsAt &&
        new Date(hold.endsAt) > startsAt,
    );
    if (overlappingReservation || overlappingHold || blockedTables.includes(selectedTable.id)) {
      setQuickWalkInError(
        "That table is occupied, held, or reserved within the next two hours. Choose another table.",
      );
      return;
    }
    if (
      !Number.isInteger(quickWalkInPartySize) ||
      quickWalkInPartySize < 1 ||
      quickWalkInPartySize > selectedTable.capacity
    ) {
      setQuickWalkInError(`Choose between 1 and ${selectedTable.capacity} guests for this table.`);
      return;
    }

    const reservation: StoredReservation = {
      id: crypto.randomUUID(),
      confirmationCode: `WI-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      guestName: "WALK-IN",
      phone: "",
      email: "",
      partySize: quickWalkInPartySize,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      tableId: selectedTable.id,
      tableIds: [selectedTable.id],
      status: "seated",
      source: "walkin",
      staffNote: "Quick-seated walk-in",
      policyVersion: 1,
      policyAcceptedAt: startsAt.toISOString(),
    };
    if (!await persistReservations([...reservations, reservation])) {
      setQuickWalkInError("Could not seat this walk-in. Check the connection and tap Seat Now again.");
      return;
    }
    setFocusedReservationId(reservation.id);
    setShowQuickWalkIn(false);
    setQuickWalkInError("");
  }

  async function updateWaitlist(entryId: string, action: WaitlistAction, tableId?: string) {
    if (saveInFlightRef.current) throw new Error("Another change is saving. Wait a moment and try again.");
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/staff/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, action, tableId }),
      });
      const payload: { state?: VersionedRestaurantState; delivery?: WaitlistDelivery[]; error?: string } = await response.json();
      if (!response.ok || !payload.state) throw new Error(payload.error ?? "The waitlist change could not be saved.");
      if (!await loadState()) throw new Error("The change was saved, but the screen could not refresh. Reload shared data before another action.");
      setAssignmentWarning(null);
      setReservationEditConflicts([]);
      setPhoneBookingConflicts([]);
      setStateError("");
      return payload.delivery;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

    function reservationAtTable(tableId: string, at: Date) {
            return reservations.find(
              (reservation) =>
                reservationTableIds(reservation).includes(tableId) &&
                reservationOccupiesTableAt(reservation, at),
            );
          }

    function holdAtTable(tableId: string, at: Date) {
            return tableHolds.find(
              (hold) =>
                hold.tableId === tableId &&
                new Date(hold.startsAt) <= at &&
                new Date(hold.endsAt) > at,
            );
          }

    function holdSelectedTable() {
            if (!selectedTableId) return;
            const hold: TableHold = {
              id: crypto.randomUUID(),
              tableId: selectedTableId,
              startsAt: floorTime.toISOString(),
              endsAt: addHours(floorTime, 2).toISOString(),
              reason: "Held for walk-ins",
            };
            persistOperations(paused, blockedTables, [...tableHolds, hold]);
          }

    async function releaseSelectedTable(reservationId?: string) {
      if (!selectedTableId) return;
      if (saveInFlightRef.current) {
        setStateError("Another change is still saving. Wait a moment and try again.");
        return;
      }
      const active = reservationId
        ? reservations.find((reservation) => reservation.id === reservationId)
        : reservationAtTable(selectedTableId, floorTime);
      if (
        reservationId &&
        (!active ||
          !isActiveServiceReservation(active) ||
          !reservationTableIds(active).includes(selectedTableId))
      ) {
        setStateError("That booking is no longer active on this table. The floor has been refreshed.");
        setFocusedReservationId(null);
        return;
      }
      const activeHold = holdAtTable(selectedTableId, floorTime);
      const nextBlockedTables = activeHold
        ? blockedTables
        : blockedTables.filter((id) => id !== selectedTableId);
      const nextTableHolds = activeHold
        ? tableHolds.filter((hold) => hold.id !== activeHold.id)
        : tableHolds;
      const nextReservations = active
        ? reservations.map((reservation) =>
            reservation.id === active.id
              ? {
                  ...reservation,
                  status: "completed" as const,
                  archivedAt: undefined,
                }
              : reservation,
          )
        : reservations;
      const saved = await saveState(currentState({
        reservations: nextReservations,
        operations: {
          onlineBookingPaused: paused,
          onlineBookingPausedForDate: paused ? pauseDate : undefined,
          blockedTableIds: nextBlockedTables,
          tableHolds: nextTableHolds,
          fixtures: savedFixtures,
          serviceNotes,
        },
      }));
      if (!saved) return;
      setBlockedTables(nextBlockedTables);
      setTableHolds(nextTableHolds);
      setReservations(nextReservations);
      if (active) setFocusedReservationId(null);
    }

    async function unassignReservation(reservationId: string) {
      const saved = await persistReservations(
        reservations.map((reservation) =>
          reservation.id === reservationId
            ? { ...reservation, tableId: "", tableIds: [] }
            : reservation,
        ),
      );
      if (!saved) return;
      setFocusedReservationId(reservationId);
      setAssignmentWarning(null);
    }

    async function assignReservationToSelected(reservationId: string, proceed = false) {
      if (!selectedTableId) return;
      const reservationToMove = reservations.find((reservation) => reservation.id === reservationId);
      const targetTable = tables.find((table) => table.id === selectedTableId);
      if (!reservationToMove || !targetTable) return;
      if (!isActiveServiceReservation(reservationToMove)) {
        setReservationToAssign("");
        setAssignmentWarning(null);
        setStateError("That reservation is already finished and cannot be seated or assigned. Use Undo completed in Finished Service first.");
        return;
      }
      const messages = warningList(
        [
          ...(reservationToMove.partySize > targetTable.capacity
            ? [`TABLE ${targetTable.name} SEATS ${targetTable.capacity}, BELOW THIS ${reservationToMove.partySize}-PERSON PARTY`]
            : []),
          ...(!targetTable.reservable ? [`TABLE ${targetTable.name} IS MARKED WALK-IN ONLY`] : []),
          ...(blockedTables.includes(targetTable.id) ? [`TABLE ${targetTable.name} IS BLOCKED`] : []),
          ...(tableHolds.some(
            (hold) =>
              hold.tableId === targetTable.id &&
              new Date(hold.startsAt) < new Date(reservationToMove.endsAt) &&
              new Date(hold.endsAt) > new Date(reservationToMove.startsAt),
          )
            ? [`TABLE ${targetTable.name} HAS A HOLD DURING THIS BOOKING`]
            : []),
        ],
        conflictDetails(new Date(reservationToMove.startsAt), [selectedTableId], reservationToMove.id),
      );
      if (messages.length > 0 && !proceed) {
        setAssignmentWarning({ reservationId, messages });
        return;
      }
      const saved = await persistReservations(
        reservations.map((reservation) =>
          reservation.id === reservationId
            ? {
                ...reservation,
                tableId: selectedTableId,
                tableIds: [selectedTableId],
                overrideReason: messages.length > 0
                  ? `Staff proceeded after warning: ${messages.join("; ")}`
                  : reservation.overrideReason,
              }
            : reservation,
        ),
      );
      if (!saved) return;
      setFocusedReservationId(reservationId);
      setAssignmentWarning(null);
      setReservationToAssign("");
    }

    function moveTable(tableId: string, clientX: number, clientY: number, map: HTMLElement) {
            const bounds = map.getBoundingClientRect();
            const x = Math.max(5, Math.min(95, ((clientX - bounds.left) / bounds.width) * 100));
            const y = Math.max(5, Math.min(95, ((clientY - bounds.top) / bounds.height) * 100));
            persistFloorLayout(
              tables.map((table) => table.id === tableId ? { ...table, x, y } : table),
            );
          }

    function addFloorTable() {
            const id = `custom-${crypto.randomUUID()}`;
            const floorTables = tables.filter((table) => table.floor === activeFloor);
            const nextNumber =
              Math.max(0, ...floorTables.map((table) => Number.parseInt(table.name, 10) || 0)) + 1;
            const table: FloorTable = {
              id,
              name: String(nextNumber),
              capacity: 2,
              x: 50,
              y: 50,
              shape: "square",
              floor: activeFloor,
              reservable: activeFloor !== "patio",
            };
            persistFloorLayout([...tables, table]);
            setSelectedTableId(id);
          }

    function updateSelectedTable(changes: Partial<FloorTable>) {
            if (!selectedTableId) return;
            persistFloorLayout(
              tables.map((table) =>
                table.id === selectedTableId ? { ...table, ...changes } : table,
              ),
            );
          }

    function removeSelectedTable() {
      if (!selectedTableId) return;
      const assigned = reservations.filter(
        (reservation) =>
          isActiveServiceReservation(reservation) &&
          reservationTableIds(reservation).includes(selectedTableId),
      );
      if (assigned.length > 0) {
        setStateError(
          `Move ${assigned.length} active booking${assigned.length === 1 ? "" : "s"} off this table before deleting it.`,
        );
        return;
      }
      persistFloorLayout(tables.filter((table) => table.id !== selectedTableId));
      setSelectedTableId(null);
    }

    function addFixture() {
      const fixture: FloorFixture = {
        id: `fixture-${crypto.randomUUID()}`,
        label: "NEW LABEL",
        x: 50,
        y: 50,
        width: 24,
        height: 8,
        floor: activeFloor,
      };
      setFixtures([...fixtures, fixture]);
      setSelectedFixtureId(fixture.id);
      setSelectedTableId(null);
    }

    function updateSelectedFixture(changes: Partial<FloorFixture>) {
      if (!selectedFixtureId) return;
      setFixtures(fixtures.map((fixture) =>
        fixture.id === selectedFixtureId ? { ...fixture, ...changes } : fixture,
      ));
    }

    function removeSelectedFixture() {
      if (!selectedFixtureId) return;
      setFixtures(fixtures.filter((fixture) => fixture.id !== selectedFixtureId));
      setSelectedFixtureId(null);
    }

    function moveFixture(fixtureId: string, clientX: number, clientY: number, map: HTMLElement) {
      const bounds = map.getBoundingClientRect();
      const x = Math.max(5, Math.min(95, ((clientX - bounds.left) / bounds.width) * 100));
      const y = Math.max(5, Math.min(95, ((clientY - bounds.top) / bounds.height) * 100));
      setFixtures(fixtures.map((fixture) =>
        fixture.id === fixtureId ? { ...fixture, x, y } : fixture,
      ));
    }

    function switchFloor(direction: number) {
      const floors: FloorName[] = ["front", "back", "patio"];
      const next = Math.max(0, Math.min(floors.length - 1, floors.indexOf(activeFloor) + direction));
      setActiveFloor(floors[next]);
      setSelectedTableId(null);
      setSelectedFixtureId(null);
    }

  const selectedServiceDayKey = format(selectedServiceDay, "yyyy-MM-dd");
  const allSelectedDayReservations = reservations.filter((reservation) =>
    reservationDayKey(new Date(reservation.startsAt)) === selectedServiceDayKey,
  );
  const selectedDayReservations = allSelectedDayReservations
    .filter(
      (reservation) =>
        !reservation.archivedAt &&
        !["cancelled", "no_show"].includes(reservation.status),
    );
  const covers = selectedDayReservations
    .reduce((total, reservation) => total + reservation.partySize, 0);
  const sourceCounts = selectedDayReservations.reduce<Record<string, number>>(
    (counts, reservation) => ({
      ...counts,
      [reservation.source]: (counts[reservation.source] ?? 0) + 1,
    }),
    {},
  );
  const hourlyPacing = selectedDayReservations.reduce<Record<string, number>>(
    (counts, reservation) => {
      const hour = formatInTimeZone(
        new Date(reservation.startsAt),
        RESTAURANT_TIMEZONE,
        "h a",
      );
      return { ...counts, [hour]: (counts[hour] ?? 0) + 1 };
    },
    {},
  );
  const editingGuestHistory = editingReservation
    ? reservations
        .filter((reservation) => {
          if (reservation.id === editingReservation.id) return false;
          const sameEmail =
            Boolean(editingReservation.email) &&
            reservation.email.toLowerCase() === editingReservation.email.toLowerCase();
          const editingPhone = normalizedPhone(editingReservation.phone);
          const samePhone =
            editingPhone.length >= 7 && normalizedPhone(reservation.phone) === editingPhone;
          return sameEmail || samePhone;
        })
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    : [];
  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekDayKeys = new Set(weekDays.map(calendarDayKey));
  const weekFinishedReservations = reservations
    .filter(
      (reservation) =>
        reservation.status === "completed" &&
        weekDayKeys.has(reservationDayKey(new Date(reservation.startsAt))),
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);
  const focusedReservation = focusedReservationId
    ? reservations.find(
        (reservation) =>
          reservation.id === focusedReservationId &&
          !reservation.archivedAt &&
          !["cancelled", "completed", "no_show"].includes(reservation.status),
      )
    : undefined;
  const selectedReservation = selectedTableId
    ? focusedReservation && reservationTableIds(focusedReservation).includes(selectedTableId)
      ? focusedReservation
      : reservationAtTable(selectedTableId, floorTime)
    : undefined;
  const selectedHold = selectedTableId ? holdAtTable(selectedTableId, floorTime) : undefined;
  const tableControlDay = focusedReservation
    ? new Date(focusedReservation.startsAt)
    : floorTime;
  const assignableReservations = selectedTable
    ? reservations.filter((reservation) => {
        if (
          !isActiveServiceReservation(reservation) ||
          reservationDayKey(new Date(reservation.startsAt)) !== reservationDayKey(tableControlDay)
        ) {
          return false;
        }
        return true;
      })
    : [];
  const now = clockNow;
  const arrivals = upcomingArrivals(reservations, now, reservationDayKey);
  const activeTableTurns = liveTableTurns(reservations, now);
  const unassigned = reservations.filter((reservation) =>
    isActiveServiceReservation(reservation) &&
    reservationTableIds(reservation).length === 0,
  );
  const floorDayReservations = reservations
    .filter(
      (reservation) =>
        !reservation.archivedAt &&
        reservationDayKey(new Date(reservation.startsAt)) === reservationDayKey(floorTime) &&
        !["cancelled", "completed", "no_show"].includes(reservation.status),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selectedTableRun = selectedTable
    ? reservations
        .filter(
          (reservation) =>
            isActiveServiceReservation(reservation) &&
            reservationDayKey(new Date(reservation.startsAt)) === reservationDayKey(tableControlDay) &&
            reservationTableIds(reservation).includes(selectedTable.id),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : [];

  if (loading) {
    return <main className="admin-shell"><div className="empty-state">LOADING THE CONTROL ROOM...</div></main>;
  }

  return (
    <main className={tab === "floor" ? "admin-shell admin-shell--floor" : "admin-shell"}>
      <div className="admin-heading">
        <div>
          <h1>{format(new Date(), "EEEE").toUpperCase()} · LIVE SERVICE</h1>
          <section className="stat-strip" aria-label="Service totals">
            <div>
              <strong>{selectedDayReservations.length}</strong>
              <span>{selectedServiceDayKey === reservationDayKey(new Date()) ? "TODAY'S BOOKINGS" : "DAY BOOKINGS"}</span>
            </div>
            <div><strong>{covers}</strong><span>DAY COVERS</span></div>
            {WAITLIST_ENABLED && <div><strong>{waitlist.filter((entry) => entry.status === "waiting").length}</strong><span>WAITING</span></div>}
            <div><strong>{tables.length - blockedTables.length}</strong><span>TABLES LIVE</span></div>
          </section>
        </div>
        <div className="service-actions">
          <button
            className={browserAlertsEnabled ? "button button-yellow" : "button button-outline"}
            onClick={() => void enableBrowserAlerts()}
          >
            <BellRing size={18} /> {browserAlertsEnabled ? "BROWSER ALERTS ON" : "ENABLE ALERTS"}
          </button>
          <button
            className={paused ? "button button-yellow" : "button button-outline"}
            onClick={() => persistOperations(!paused, blockedTables, tableHolds)}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
            {paused ? "RESUME TODAY" : "PAUSE TODAY"}
          </button>
          <button className="button button-pink" onClick={() => {
            setPhoneBookingTable("");
            setPhoneBookingError("");
            setPhoneBookingConflicts([]);
            setPhoneBookingStartsAt(new Date());
            setShowPhoneForm(true);
          }}>
            <CalendarPlus size={18} /> PHONE BOOKING
          </button>
        </div>
      </div>

      {paused && (
        <div className="alert-banner">
          <ShieldAlert size={20} /> ONLINE BOOKINGS ARE PAUSED FOR TODAY ONLY. TOMORROW AND FUTURE DATES REMAIN OPEN.
        </div>
      )}
      {reservationAlert && (
        <div className={`new-booking-alert alert-${reservationAlert.kind}`} role="alert">
          <BellRing size={24} />
          <div>
            <strong>
              {reservationAlert.kind === "new"
                ? reservationAlert.reservations.length === 1
                  ? "NEW RESERVATION JUST LANDED"
                  : `${reservationAlert.reservations.length} NEW RESERVATIONS JUST LANDED`
                : reservationAlert.kind === "edited"
                  ? "GUEST CHANGED A RESERVATION"
                  : "GUEST CANCELLED A RESERVATION"}
            </strong>
            <span>
              {reservationAlert.reservations
                .map(
                  (reservation) =>
                    `${reservation.guestName} · ${reservation.partySize} guests · ${formatRestaurant(new Date(reservation.startsAt), "EEE h:mm a")}`,
                )
                .join("  /  ")}
            </span>
          </div>
          <button onClick={() => {
            const latest = reservationAlert.reservations.at(-1);
            if (latest) setSelectedServiceDay(new Date(latest.startsAt));
            setTab("bookings");
            dismissReservationAlert();
          }}>
            VIEW
          </button>
          <button onClick={dismissReservationAlert} aria-label="Dismiss reservation alert">
            <X size={17} />
          </button>
        </div>
      )}
      {stateError && (
        <div className="delivery-feedback error" role="alert">
          {stateError} <button onClick={() => void loadState()}>RELOAD SHARED DATA</button>
        </div>
      )}
      {saving && <div className="save-status" role="status">SAVING SHARED CHANGES…</div>}

      <nav className="admin-tabs" aria-label="Dashboard sections">
        <button className={tab === "floor" ? "active" : ""} onClick={() => setTab("floor")}>LIVE FLOOR</button>
        <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>RESERVATIONS</button>
        <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>WEEK CALENDAR</button>
        {WAITLIST_ENABLED && (
          <button className={tab === "waitlist" ? "active" : ""} onClick={() => setTab("waitlist")}>
            WAITLIST <span>{waitlist.filter((entry) => entry.status === "waiting").length}</span>
          </button>
        )}
        <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>SERVICE REPORT</button>
      </nav>

      <div className="admin-workspace">
        <aside className="service-sidebar" aria-label="Live service overview">
      <section className="service-rail">
        <div className="service-rail-group">
          <div className="rail-heading">
            <strong>ARRIVALS · NEXT 90 MIN</strong>
            <span>{arrivals.length} parties</span>
          </div>
          <div className="arrival-cards">
            {arrivals.map((reservation) => {
              const minutesLate = Math.floor((now.getTime() - new Date(reservation.startsAt).getTime()) / 60_000);
              return (
              <button
                className={minutesLate > 15 && reservation.status === "confirmed" ? "arrival-card late" : "arrival-card"}
                key={reservation.id}
                onClick={() => focusReservation(reservation)}
              >
                <time>{formatRestaurant(new Date(reservation.startsAt), "h:mm a")}</time>
                <strong>{reservation.guestName}</strong>
                <span>{reservation.partySize} ppl · {minutesLate > 15 && reservation.status === "confirmed" ? `${minutesLate} MIN LATE` : reservation.status}</span>
              </button>
              );
            })}
            {arrivals.length === 0 && <span className="rail-empty">No arrivals in the next 90 minutes.</span>}
          </div>
        </div>
        <div className="service-rail-group table-turns-group">
          <div className="rail-heading">
            <strong>LIVE TABLE TIMERS</strong>
            <span>{activeTableTurns.length} seated</span>
          </div>
          <div className="arrival-cards table-turn-cards">
            {activeTableTurns.map((reservation) => {
              const minutesRemaining = minutesUntilTurnEnds(reservation, now);
              return (
              <button
                className={[
                  "arrival-card",
                  "table-turn-card",
                  minutesRemaining <= 0 ? "overdue" : minutesRemaining <= 30 ? "ending-soon" : "",
                ].filter(Boolean).join(" ")}
                key={reservation.id}
                onClick={() => focusReservation(reservation)}
              >
                <time>TABLE {reservationTableNames(reservation)} · DUE {formatRestaurant(new Date(reservation.endsAt), "h:mm a")}</time>
                <strong>{reservation.guestName}</strong>
                <span>{turnCountdownLabel(minutesRemaining)}</span>
              </button>
              );
            })}
            {activeTableTurns.length === 0 && <span className="rail-empty">No tables currently seated.</span>}
          </div>
        </div>
      </section>

      {unassigned.length > 0 && (
        <div className="unassigned-alert">
          <ShieldAlert size={18} />
          <strong>{unassigned.length} UNASSIGNED RESERVATION{unassigned.length === 1 ? "" : "S"}</strong>
          <button onClick={() => setTab("bookings")}>REVIEW NOW</button>
        </div>
      )}
      {tab === "floor" && (
        <section className="floor-day-book" aria-label="Floor reservation list">
          <div className="rail-heading">
            <strong>FLOOR DAY BOOK</strong>
            <span>{format(floorTime, "EEE, MMM d")}</span>
          </div>
          <div className="floor-day-list">
            {floorDayReservations
              .filter((reservation) => reservation.status !== "completed")
              .map((reservation) => (
                <button
                  className={
                    focusedReservationId === reservation.id
                      ? "sidebar-reservation active"
                      : "sidebar-reservation"
                  }
                  key={reservation.id}
                  onClick={() => focusReservation(reservation)}
                >
                  <time>{formatRestaurant(new Date(reservation.startsAt), "h:mm a")}</time>
                  <span>
                    <strong>{reservation.guestName}</strong>
                    <small>
                      {reservation.partySize} ppl · T{reservationTableNames(reservation)} · {reservation.status}
                    </small>
                  </span>
                </button>
              ))}
            {floorDayReservations.filter((reservation) => reservation.status !== "completed").length === 0 && (
              <span className="rail-empty">No active reservations for this day.</span>
            )}
          </div>
        </section>
      )}
        </aside>
        <div className="admin-main">

      {tab === "bookings" && (
        <section className="admin-panel">
          <div className="panel-toolbar">
            <div>
              <h2>{showRemoved ? "REMOVED" : "RESERVATIONS"}</h2>
              <p>
                {showRemoved
                  ? "Hidden from service views. Restore anything removed by mistake."
                  : format(selectedServiceDay, "EEEE, MMMM d, yyyy").toUpperCase()}
              </p>
            </div>
            <div className="panel-toolbar-actions">
              {!showRemoved && (
                <div className="service-day-controls" aria-label="Selected reservation day">
                  <button
                    onClick={() => setSelectedServiceDay(addDays(selectedServiceDay, -1))}
                    aria-label="Previous day"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className={selectedServiceDayKey === reservationDayKey(new Date()) ? "active" : ""}
                    onClick={() => setSelectedServiceDay(new Date())}
                  >
                    TODAY
                  </button>
                  <button
                    onClick={() => setSelectedServiceDay(addDays(selectedServiceDay, 1))}
                    aria-label="Next day"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              <label className="search-field">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search guest, code, phone..."
                />
              </label>
              <button
                className={showRemoved ? "removed-toggle active" : "removed-toggle"}
                onClick={() => setShowRemoved(!showRemoved)}
              >
                {showRemoved ? (
                  <>← BACK TO BOOK</>
                ) : (
                  <><Trash2 size={15} /> REMOVED ({reservations.filter((item) => item.archivedAt).length})</>
                )}
              </button>
            </div>
          </div>
          {!showRemoved && (
            <form className="service-note" onSubmit={saveServiceNote}>
              <label htmlFor="service-note">SHIFT HANDOVER · {format(selectedServiceDay, "EEE, MMM d").toUpperCase()}</label>
              <textarea
                id="service-note"
                name="serviceNote"
                key={selectedServiceDayKey}
                defaultValue={serviceNotes[selectedServiceDayKey] ?? ""}
                rows={2}
                placeholder="86'd items, VIP arrivals, accessibility needs, staffing notes..."
              />
              <button>SAVE NOTE</button>
            </form>
          )}
          <div className="reservation-list">
            {activeBookReservations.map((reservation) => {
              return (
                <article className={`reservation-row status-${reservation.status}`} key={reservation.id}>
                  <time>
                    <strong>{formatRestaurant(new Date(reservation.startsAt), "h:mm")}</strong>
                    <span>{formatRestaurant(new Date(reservation.startsAt), "a")}</span>
                  </time>
                  <div className="guest-cell">
                    <strong>{reservation.guestName}</strong>
                    <span>{reservation.confirmationCode} · {reservation.source}</span>
                    {(reservation.vip || reservation.allergies || reservation.accessibility || reservation.occasion) && (
                      <span className="guest-flags">
                        {[
                          reservation.vip ? "VIP" : "",
                          reservation.allergies ? `ALLERGY: ${reservation.allergies}` : "",
                          reservation.accessibility ? `ACCESS: ${reservation.accessibility}` : "",
                          reservation.occasion ?? "",
                        ].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {reservation.overrideReason && <span className="override-note">OVERRIDE · {reservation.overrideReason}</span>}
                  </div>
                  <div className="party-cell"><Users size={17} /> {reservation.partySize}</div>
                  <button
                    className="table-badge table-assignment-button"
                    onClick={() => openReservationEditor(reservation)}
                    title="Edit reservation and table assignments"
                  >
                    {reservationTableNames(reservation)}
                  </button>
                  <span className="status-badge">{reservation.status.replace("_", " ")}</span>
                  <div className="row-actions">
                    {(reservation.request || reservation.staffNote) && (
                      <button
                        className="note-action"
                        title={[
                          reservation.request ? `Guest: ${reservation.request}` : "",
                          reservation.staffNote ? `Staff: ${reservation.staffNote}` : "",
                        ].filter(Boolean).join(" · ")}
                        aria-label={`View notes for ${reservation.guestName}`}
                        onClick={() => openReservationEditor(reservation)}
                      >
                        <StickyNote size={18} />
                      </button>
                    )}
                    {reservation.archivedAt ? (
                      <button
                        className="restore-action"
                        title="Restore to the reservation book"
                        aria-label={`Restore removed reservation for ${reservation.guestName}`}
                        onClick={() => restoreArchivedReservation(reservation)}
                      >
                        <ArchiveRestore size={18} />
                      </button>
                    ) : !["completed", "cancelled", "no_show"].includes(reservation.status) ? (
                      <>
                        <button
                          className="row-edit-action"
                          title="Edit reservation"
                          onClick={() => openReservationEditor(reservation)}
                        >
                          <SquarePen size={18} />
                          <span>EDIT</span>
                        </button>
                        <button
                          className="row-primary-action"
                          title={nextStatusAction(reservation.status)}
                          onClick={() => void advanceStatus(reservation)}
                        >
                          <UserRoundCheck size={18} />
                          <span>{nextStatusAction(reservation.status)}</span>
                        </button>
                        <details className="row-more-actions">
                          <summary aria-label={`More actions for ${reservation.guestName}`}>
                            <MoreHorizontal size={18} /><span>MORE</span>
                          </summary>
                          <div>
                            {reservation.status !== "seated" && (
                              <button onClick={() => confirmStatus(reservation, "no_show")}>
                                <Ban size={16} /> NO-SHOW
                              </button>
                            )}
                            <button onClick={() => confirmStatus(reservation, "cancelled")}>
                              <X size={16} /> CANCEL
                            </button>
                          </div>
                        </details>
                      </>
                    ) : (
                      <>
                        <button
                          className="restore-action"
                          title={`Undo ${reservation.status.replace("_", " ")}`}
                          aria-label={`Undo ${reservation.status.replace("_", " ")} for ${reservation.guestName}`}
                          onClick={() => restoreReservation(reservation)}
                        >
                          <RotateCcw size={18} />
                        </button>
                        {["cancelled", "no_show"].includes(reservation.status) && (
                          <button
                            className="remove-action"
                            title="Remove from operational views"
                            aria-label={`Remove ${reservation.status.replace("_", " ")} reservation for ${reservation.guestName}`}
                            onClick={() => archiveReservation(reservation)}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {activeBookReservations.length === 0 && finishedReservations.length === 0 && (
              <div className="empty-state">
                {showRemoved
                  ? "NOTHING REMOVED."
                  : `NO RESERVATIONS FOR ${format(selectedServiceDay, "EEEE, MMMM d").toUpperCase()}.`}
              </div>
            )}
          </div>
          {finishedReservations.length > 0 && (
            <details className="finished-reservations">
              <summary>FINISHED SERVICE · RESERVATIONS + WALK-INS ({finishedReservations.length})</summary>
              <div className="reservation-list">
                {finishedReservations.map((reservation) => (
                  <article className="reservation-row status-completed" key={reservation.id}>
                    <time>
                      <strong>{formatRestaurant(new Date(reservation.startsAt), "h:mm")}</strong>
                      <span>{formatRestaurant(new Date(reservation.startsAt), "a")}</span>
                    </time>
                    <div className="guest-cell">
                      <strong>{reservation.guestName}</strong>
                      <span>{reservation.confirmationCode} · {reservation.source}</span>
                      {(reservation.request || reservation.staffNote) && (
                        <span>{[reservation.request, reservation.staffNote].filter(Boolean).join(" · ")}</span>
                      )}
                    </div>
                    <div className="party-cell"><Users size={17} /> {reservation.partySize}</div>
                    <span className="table-badge">{reservationTableNames(reservation)}</span>
                    <span className="status-badge">completed</span>
                    <div className="row-actions">
                      <button
                        className="restore-action"
                        title="Undo completed"
                        onClick={() => restoreReservation(reservation)}
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {tab === "calendar" && (
        <section className="admin-panel calendar-panel">
          <div className="panel-toolbar">
            <div>
              <h2>WEEK AT A GLANCE</h2>
              <p>{format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}</p>
            </div>
            <div className="calendar-controls">
              <button onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Previous week"><ChevronLeft /></button>
              <button onClick={() => setWeekOffset(0)}>THIS WEEK</button>
              <button onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Next week"><ChevronRight /></button>
            </div>
          </div>
          <div className="week-calendar">
            {weekDays.map((day) => {
              const dayReservations = reservations
                .filter(
                  (reservation) =>
                    !reservation.archivedAt &&
                    !["cancelled", "completed", "no_show"].includes(reservation.status) &&
                    reservationDayKey(new Date(reservation.startsAt)) === calendarDayKey(day),
                )
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div
                  className={[
                    "calendar-day",
                    calendarDayKey(day) === reservationDayKey(new Date()) ? "today" : "",
                    calendarDayKey(day) === selectedServiceDayKey ? "selected" : "",
                  ].filter(Boolean).join(" ")}
                  key={day.toISOString()}
                >
                  <button
                    className="calendar-day-select"
                    onClick={() => openReservationDay(day)}
                    aria-label={`View reservations for ${format(day, "EEEE, MMMM d")}`}
                  >
                    <span>{format(day, "EEE").toUpperCase()}</span>
                    <strong>{format(day, "d")}</strong>
                    <small>{dayReservations.reduce((sum, item) => sum + item.partySize, 0)} COVERS</small>
                  </button>
                  <div className="day-bookings">
                    {dayReservations.map((reservation) => (
                      <button
                        className={`calendar-booking status-${reservation.status}`}
                        key={reservation.id}
                        onClick={() => focusReservation(reservation)}
                      >
                        <time>{formatRestaurant(new Date(reservation.startsAt), "h:mm a")}</time>
                        <strong>{reservation.guestName}</strong>
                        <span>{reservation.partySize} ppl · {reservationTableNames(reservation)}</span>
                      </button>
                    ))}
                    {dayReservations.length === 0 && <span className="day-empty">NO BOOKINGS</span>}
                  </div>
                  <button className="day-add" onClick={() => addReservationForDay(day)}>
                    <CalendarPlus size={14} /> ADD
                  </button>
                </div>
              );
            })}
          </div>
          {weekFinishedReservations.length > 0 && (
            <details className="calendar-finished">
              <summary>FINISHED THIS WEEK · RESERVATIONS + WALK-INS ({weekFinishedReservations.length})</summary>
              <div className="calendar-finished-list">
                {weekFinishedReservations.map((reservation) => (
                  <article key={reservation.id}>
                    <time>{formatRestaurant(new Date(reservation.startsAt), "EEE · h:mm a")}</time>
                    <strong>{reservation.guestName}</strong>
                    <span>{reservation.partySize} PEOPLE · TABLE {reservationTableNames(reservation)} · {reservation.source.toUpperCase()}</span>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {tab === "reports" && (
        <section className="admin-panel report-panel">
          <div className="panel-toolbar">
            <div>
              <h2>SERVICE REPORT</h2>
              <p>{format(selectedServiceDay, "EEEE, MMMM d, yyyy").toUpperCase()}</p>
            </div>
            <div className="service-day-controls print-hide">
              <button onClick={() => setSelectedServiceDay(addDays(selectedServiceDay, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
              <button onClick={() => setSelectedServiceDay(new Date())}>TODAY</button>
              <button onClick={() => setSelectedServiceDay(addDays(selectedServiceDay, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
              <button onClick={() => window.print()}>PRINT SHEET</button>
            </div>
          </div>
          <div className="report-stats">
            <div><strong>{selectedDayReservations.length}</strong><span>BOOKINGS</span></div>
            <div><strong>{covers}</strong><span>COVERS</span></div>
            <div><strong>{allSelectedDayReservations.filter((item) => item.status === "cancelled").length}</strong><span>CANCELLED</span></div>
            <div><strong>{allSelectedDayReservations.filter((item) => item.status === "no_show").length}</strong><span>NO-SHOWS</span></div>
            <div><strong>{selectedDayReservations.filter((item) => item.status === "completed").length}</strong><span>COMPLETED</span></div>
          </div>
          {serviceNotes[selectedServiceDayKey] && (
            <div className="report-note">
              <strong>SHIFT HANDOVER</strong>
              <p>{serviceNotes[selectedServiceDayKey]}</p>
            </div>
          )}
          <div className="report-grid">
            <section>
              <h3>HOURLY PACE</h3>
              {Object.entries(hourlyPacing).map(([hour, count]) => (
                <div className="report-line" key={hour}>
                  <span>{hour}</span><strong>{count} / 3 STARTS</strong>
                </div>
              ))}
              {Object.keys(hourlyPacing).length === 0 && <p>NO BOOKINGS.</p>}
            </section>
            <section>
              <h3>BOOKING SOURCE</h3>
              {Object.entries(sourceCounts).map(([source, count]) => (
                <div className="report-line" key={source}>
                  <span>{source.toUpperCase()}</span><strong>{count}</strong>
                </div>
              ))}
              {Object.keys(sourceCounts).length === 0 && <p>NO BOOKINGS.</p>}
            </section>
          </div>
          <div className="print-service-list">
            <h3>SERVICE SHEET</h3>
            {selectedDayReservations
              .slice()
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
              .map((reservation) => (
                <article key={reservation.id}>
                  <time>{formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "h:mm a")}</time>
                  <strong>{reservation.guestName}</strong>
                  <span>{reservation.partySize} guests · T{reservationTableNames(reservation)}</span>
                  <span>{reservation.vip ? "VIP · " : ""}{reservation.allergies ? `ALLERGY: ${reservation.allergies}` : reservation.occasion ?? ""}</span>
                  <span>{reservation.status.replace("_", " ")}</span>
                </article>
              ))}
          </div>
        </section>
      )}

      {WAITLIST_ENABLED && tab === "waitlist" && (
        <WaitlistPanel state={currentState()} onAction={updateWaitlist} />
      )}

      {tab === "floor" && (
        <section className="admin-panel floor-panel">
          <div className="panel-toolbar">
            <div>
              <h2 className="sr-only">{followNow ? "LIVE FLOOR" : "FLOOR PLAN"}</h2>
              <div className={followNow ? "planning-status live floor-view-status" : "planning-status future floor-view-status"}>
                <Clock3 size={14} />
                <strong>{followNow ? "NOW" : "PLANNING"}</strong>
                <span>{formatRestaurant(floorTime, "EEE, MMM d · h:mm a")}</span>
              </div>
            </div>
            <div className="floor-toolbar-actions">
              <label className="floor-time-control">
                <span className="sr-only">VIEW FLOOR AT</span>
                <input
                  type="datetime-local"
                  value={formatInTimeZone(floorTime, RESTAURANT_TIMEZONE, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(event) => {
                    setFloorTime(fromZonedTime(event.target.value, RESTAURANT_TIMEZONE));
                    setFollowNow(false);
                  }}
                />
              </label>
              <button
                className={followNow ? "edit-floor-button active" : "edit-floor-button"}
                onClick={() => {
                  setFloorTime(new Date());
                  setFollowNow(true);
                }}
              >
                NOW
              </button>
              {!editingFloor ? (
                <button className="edit-floor-button" onClick={() => setEditingFloor(true)}>EDIT FLOOR</button>
              ) : (
                <>
                  <button className="edit-floor-button active" onClick={() => void saveFloorLayout()}><Save size={15} /> SAVE</button>
                  <button className="edit-floor-button" onClick={discardFloorLayout}><Undo2 size={15} /> DISCARD</button>
                </>
              )}
            </div>
          </div>
          <div className="floor-tabs">
            {(["front", "back", "patio"] as FloorName[]).map((floor) => (
              <button className={activeFloor === floor ? "active" : ""} key={floor} onClick={() => setActiveFloor(floor)}>
                {floor === "front" ? "FRONT INSIDE" : floor === "back" ? "BACK INSIDE" : "BACK PATIO"}
              </button>
            ))}
            {editingFloor && (
              <>
                <button className="add-table-button" onClick={addFloorTable}>+ ADD TABLE</button>
                <button className="add-table-button" onClick={addFixture}>+ ADD LABEL / BOX</button>
                <button
                  className="reset-floor-button"
                  onClick={() => {
                    persistFloorLayout(DEFAULT_TABLES.map((table) => ({ ...table })));
                    setFixtures(DEFAULT_FIXTURES.map((fixture) => ({ ...fixture })));
                    setSelectedTableId(null);
                    setSelectedFixtureId(null);
                  }}
                >
                  RESET TO SUPPLIED PLANS
                </button>
              </>
            )}
          </div>
          {editingFloor && <div className="layout-edit-notice">LAYOUT EDIT MODE · DRAG TABLES TO MOVE THEM · CLICK TO EDIT DETAILS</div>}
          <div className="floor-key">
            <div className="floor-legend">
            <span><i className="available" /> AVAILABLE</span>
            <span><i className="reserved" /> RESERVED</span>
            <span><i className="seated" /> SEATED</span>
            <span><i className="held" /> HELD / BLOCKED</span>
            </div>
            <div className="floor-summary">
              <span><strong>{tables.filter((table) => table.floor === activeFloor && !reservationAtTable(table.id, floorTime) && !holdAtTable(table.id, floorTime) && !blockedTables.includes(table.id)).length}</strong> OPEN</span>
              <span><strong>{tables.filter((table) => table.floor === activeFloor && reservationAtTable(table.id, floorTime)).length}</strong> IN USE</span>
              <span><strong>{tableHolds.filter((hold) => new Date(hold.startsAt) <= floorTime && new Date(hold.endsAt) > floorTime).length + blockedTables.length}</strong> HELD</span>
            </div>
          </div>
          <div className={`floor-map-viewport viewport-${activeFloor}`}>
          <div
            className={`floor-map floor-${activeFloor}`}
            onTouchStart={(event) => {
              setTouchStartX(event.touches[0]?.clientX ?? null);
              setTouchStartY(event.touches[0]?.clientY ?? null);
            }}
            onTouchEnd={(event) => {
              if (touchStartX === null || touchStartY === null) return;
              const distanceX = event.changedTouches[0]?.clientX - touchStartX;
              const distanceY = event.changedTouches[0]?.clientY - touchStartY;
              const viewport = event.currentTarget.parentElement;
              const mapFitsViewport = viewport && viewport.scrollWidth <= viewport.clientWidth;
              if (mapFitsViewport && Math.abs(distanceX) > 60 && Math.abs(distanceX) > Math.abs(distanceY) * 1.25) {
                switchFloor(distanceX < 0 ? 1 : -1);
              }
              setTouchStartX(null);
              setTouchStartY(null);
            }}
          >
            {fixtures.filter((fixture) => fixture.floor === activeFloor).map((fixture) => (
              <button
                className={editingFloor ? "floor-fixture editable" : "floor-fixture"}
                key={fixture.id}
                style={{
                  left: `${fixture.x}%`,
                  top: `${fixture.y}%`,
                  width: `${fixture.width}%`,
                  height: `${fixture.height}%`,
                }}
                draggable={editingFloor}
                onDragEnd={(event) => {
                  if (editingFloor && event.currentTarget.parentElement) {
                    moveFixture(fixture.id, event.clientX, event.clientY, event.currentTarget.parentElement);
                  }
                }}
                onClick={() => {
                  if (!editingFloor) return;
                  setSelectedFixtureId(fixture.id);
                  setSelectedTableId(null);
                }}
              >
                {fixture.label}
              </button>
            ))}
            {tables.filter((table) => table.floor === activeFloor).map((table) => {
              const blocked = blockedTables.includes(table.id);
              const activeReservation = reservationAtTable(table.id, floorTime);
              const hold = holdAtTable(table.id, floorTime);
              const state = blocked || hold
                ? "held"
                : activeReservation?.status === "seated"
                  ? "seated"
                  : activeReservation
                    ? "reserved"
                    : "available";
              return (
                <button
                  className={`floor-table ${table.shape} ${table.capacity === 1 ? "bar-seat" : ""} ${state}`}
                  key={table.id}
                  style={{ left: `${table.x}%`, top: `${table.y}%` }}
                  draggable={editingFloor}
                  onDragEnd={(event) => {
                    if (editingFloor && event.currentTarget.parentElement) {
                      moveTable(table.id, event.clientX, event.clientY, event.currentTarget.parentElement);
                    }
                  }}
                  onClick={() => {
                    setSelectedTableId(table.id);
                    setFocusedReservationId(null);
                    setAssignmentWarning(null);
                    setSelectedFixtureId(null);
                    setShowQuickWalkIn(false);
                    setQuickWalkInError("");
                  }}
                >
                  <strong>{table.name}</strong>
                  <span>{table.capacity} TOP</span>
                  <small>{blocked ? "BLOCKED" : hold ? "HELD" : activeReservation?.guestName ?? "OPEN"}</small>
                </button>
              );
            })}
          </div>
          </div>
          {editingFloor && selectedFixture && (
            <div className="fixture-editor">
              <label>LABEL<input value={selectedFixture.label} onChange={(event) => updateSelectedFixture({ label: event.target.value })} /></label>
              <label>WIDTH<input type="number" min="5" max="90" value={selectedFixture.width} onChange={(event) => updateSelectedFixture({ width: Number(event.target.value) })} /></label>
              <label>HEIGHT<input type="number" min="4" max="50" value={selectedFixture.height} onChange={(event) => updateSelectedFixture({ height: Number(event.target.value) })} /></label>
              <button className="remove-table-button" onClick={removeSelectedFixture}>REMOVE LABEL / BOX</button>
            </div>
          )}
        </section>
      )}
        </div>
      </div>

      {selectedTable && tab === "floor" && (
        <div className="modal-backdrop" role="presentation">
          <section className="staff-modal table-modal" role="dialog" aria-modal="true" aria-labelledby="table-title">
            <button
              className="modal-close"
              onClick={() => {
                setSelectedTableId(null);
                setFocusedReservationId(null);
                setAssignmentWarning(null);
                setShowQuickWalkIn(false);
                setQuickWalkInError("");
              }}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="step-label">
              {focusedReservation
                ? `BOOKING CONTROL · ${formatRestaurant(new Date(focusedReservation.startsAt), "MMM d · h:mm a")} · LIVE FLOOR REMAINS ${formatRestaurant(floorTime, "h:mm a")}`
                : `LIVE FLOOR CONTROL · ${format(floorTime, "MMM d · h:mm a")}`}
            </p>
            <h2 id="table-title">{selectedTable.name} · {selectedTable.capacity} TOP</h2>
            {stateError && <div className="modal-save-error" role="alert">{stateError}</div>}
            {editingFloor && (
              <div className="table-editor">
                <div className="field-grid">
                  <label>TABLE NAME<input value={selectedTable.name} onChange={(event) => updateSelectedTable({ name: event.target.value })} /></label>
                  <label>SEATS<input type="number" min="1" max="20" value={selectedTable.capacity} onChange={(event) => updateSelectedTable({ capacity: Number(event.target.value) })} /></label>
                </div>
                <div className="field-grid">
                  <label>SHAPE<select value={selectedTable.shape} onChange={(event) => updateSelectedTable({ shape: event.target.value as FloorTable["shape"] })}><option value="square">Square</option><option value="round">Round</option><option value="long">Long</option></select></label>
                  <label className="editor-checkbox"><input type="checkbox" checked={selectedTable.reservable} onChange={(event) => updateSelectedTable({ reservable: event.target.checked })} /> ONLINE RESERVABLE</label>
                </div>
                <button className="remove-table-button" onClick={removeSelectedTable}>REMOVE TABLE</button>
              </div>
            )}
            {selectedReservation ? (
              <div className="table-guest-card">
                <span className="status-badge">{selectedReservation.status}</span>
                <strong>{selectedReservation.guestName}</strong>
                <span>
                  {selectedReservation.partySize} guests · {selectedReservation.phone || selectedReservation.source.toUpperCase()}
                </span>
                <span>{formatRestaurant(new Date(selectedReservation.startsAt), "h:mm a")} – {formatRestaurant(new Date(selectedReservation.endsAt), "h:mm a")}</span>
                {selectedReservation.status === "seated" && (
                  <span className={[
                    "table-turn-countdown",
                    minutesUntilTurnEnds(selectedReservation, now) <= 0
                      ? "overdue"
                      : minutesUntilTurnEnds(selectedReservation, now) <= 30
                        ? "ending-soon"
                        : "",
                  ].filter(Boolean).join(" ")}>
                    {turnCountdownLabel(minutesUntilTurnEnds(selectedReservation, now))}
                  </span>
                )}
                {selectedReservation.overrideReason && <span className="override-warning">OVERRIDE · {selectedReservation.overrideReason}</span>}
                {(selectedReservation.vip ||
                  selectedReservation.allergies ||
                  selectedReservation.accessibility ||
                  selectedReservation.occasion ||
                  selectedReservation.request ||
                  selectedReservation.staffNote) && (
                  <div className="service-critical-details">
                    <strong>SERVICE DETAILS</strong>
                    {selectedReservation.allergies && <p className="critical">ALLERGY · {selectedReservation.allergies}</p>}
                    {selectedReservation.accessibility && <p>ACCESS · {selectedReservation.accessibility}</p>}
                    {selectedReservation.vip && <p>VIP / REGULAR GUEST</p>}
                    {selectedReservation.occasion && <p>OCCASION · {selectedReservation.occasion}</p>}
                    {selectedReservation.request && <p>GUEST REQUEST · {selectedReservation.request}</p>}
                    {selectedReservation.staffNote && <p>STAFF NOTE · {selectedReservation.staffNote}</p>}
                  </div>
                )}
                <div className="table-action-grid">
                  {selectedReservation.status === "confirmed" && <button onClick={() => setStatus(selectedReservation.id, "arrived")}>MARK ARRIVED</button>}
                  {["confirmed", "arrived"].includes(selectedReservation.status) && <button onClick={() => setStatus(selectedReservation.id, "seated")}>SEAT PARTY</button>}
                  <button className="complete-action" onClick={() => void releaseSelectedTable(selectedReservation.id)}>COMPLETE & RELEASE TABLE</button>
                  <button onClick={() => openReservationEditor(selectedReservation)}>EDIT BOOKING / NOTES</button>
                  <button onClick={() => unassignReservation(selectedReservation.id)}>UNASSIGN</button>
                  {selectedReservation.status !== "seated" && <button onClick={() => confirmStatus(selectedReservation, "no_show")}>NO-SHOW</button>}
                </div>
              </div>
            ) : selectedHold || blockedTables.includes(selectedTable.id) ? (
              <div className="table-guest-card">
                <span className="status-badge">HELD</span>
                <strong>{selectedHold?.reason ?? "Blocked until released"}</strong>
                {selectedHold && <span>{format(new Date(selectedHold.startsAt), "h:mm a")} – {format(new Date(selectedHold.endsAt), "h:mm a")}</span>}
                <button className="button button-yellow" onClick={() => void releaseSelectedTable()}>
                  {selectedHold ? "RELEASE THIS HOLD" : "UNBLOCK TABLE"}
                </button>
              </div>
            ) : (
              <>
                <div className="available-callout"><CheckCircle /> AVAILABLE AT THIS TIME</div>
                <div className="table-action-grid">
                  <button onClick={holdSelectedTable}>HOLD 2 HOURS FOR WALK-INS</button>
                  <button
                    onClick={() => persistOperations(paused, [...blockedTables, selectedTable.id], tableHolds)}
                  >
                    BLOCK UNTIL RELEASED
                  </button>
                  <button
                    className="quick-walkin-button"
                    onClick={() => {
                      setQuickWalkInPartySize(Math.min(2, selectedTable.capacity));
                      setQuickWalkInError("");
                      setShowQuickWalkIn(true);
                    }}
                  >
                    SEAT WALK-IN NOW
                  </button>
                </div>
                {showQuickWalkIn && (
                  <form className="quick-walkin-form" onSubmit={seatQuickWalkIn}>
                    <div>
                      <strong>WALK-IN · TABLE {selectedTable.name}</strong>
                      <span>Seat immediately for two hours.</span>
                    </div>
                    <label>
                      PEOPLE
                      <input
                        type="number"
                        min="1"
                        max={selectedTable.capacity}
                        value={quickWalkInPartySize}
                        onChange={(event) => {
                          setQuickWalkInPartySize(Number(event.target.value));
                          setQuickWalkInError("");
                        }}
                        required
                      />
                    </label>
                    <button>SEAT NOW</button>
                    <button
                      className="quick-walkin-cancel"
                      type="button"
                      onClick={() => {
                        setShowQuickWalkIn(false);
                        setQuickWalkInError("");
                      }}
                    >
                      CANCEL
                    </button>
                    {quickWalkInError && <p className="form-error" role="alert">{quickWalkInError}</p>}
                  </form>
                )}
              </>
            )}
            {!editingFloor && (
              <div className="assignment-panel">
                <div className="assignment-heading">
                  <strong>MOVE A RESERVATION TO TABLE {selectedTable.name}</strong>
                  <span>Choose a booking for {format(tableControlDay, "EEEE, MMM d")}. Capacity, holds, blocks and overlaps are checked before moving.</span>
                </div>
                <div className="assignment-controls">
                  <select
                    aria-label="Reservation to move"
                    value={reservationToAssign}
                    onChange={(event) => {
                      setReservationToAssign(event.target.value);
                      setAssignmentWarning(null);
                    }}
                  >
                    <option value="">Choose an active reservation...</option>
                    {assignableReservations.map((reservation) => (
                      <option value={reservation.id} key={reservation.id}>
                        {formatRestaurant(new Date(reservation.startsAt), "EEE h:mm a")} · {reservation.guestName} · {reservation.partySize} guests
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!reservationToAssign}
                    onClick={() => assignReservationToSelected(reservationToAssign)}
                  >
                    MOVE TO TABLE {selectedTable.name}
                  </button>
                </div>
                {assignableReservations.length === 0 && (
                  <small>NO ACTIVE RESERVATIONS FOR THIS DAY.</small>
                )}
                {assignmentWarning && (
                  <div className="conflict-review" role="alert">
                    <strong>CHECK BEFORE ASSIGNING</strong>
                    <span>This table has a conflict. You can still proceed.</span>
                    <ul>{assignmentWarning.messages.map((message) => <li key={message}>{message}</li>)}</ul>
                    <div className="conflict-actions">
                      <button type="button" onClick={() => setAssignmentWarning(null)}>CANCEL</button>
                      <button type="button" onClick={() => assignReservationToSelected(assignmentWarning.reservationId, true)}>PROCEED ANYWAY</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!editingFloor && (
              <div className="table-run">
                <div className="assignment-heading">
                  <strong>TABLE {selectedTable.name} · DAY RUN</strong>
                  <span>Control every active turn on {format(tableControlDay, "EEEE, MMM d")} without changing the live floor time.</span>
                </div>
                <div className="table-run-list">
                  {selectedTableRun.map((reservation) => (
                    <article className="table-run-turn" key={reservation.id}>
                      <button
                        className={
                          selectedReservation?.id === reservation.id ? "table-run-booking active" : "table-run-booking"
                        }
                        onClick={() => setFocusedReservationId(reservation.id)}
                      >
                        <time>
                          {formatRestaurant(new Date(reservation.startsAt), "h:mm a")}–
                          {formatRestaurant(new Date(reservation.endsAt), "h:mm a")}
                        </time>
                        <strong>{reservation.guestName}</strong>
                        <span>{reservation.partySize} guests · {reservation.status}</span>
                      </button>
                      <div className="table-run-actions" aria-label={`Actions for ${reservation.guestName}`}>
                        {reservation.status === "confirmed" && (
                          <button onClick={() => setStatus(reservation.id, "arrived")}>ARRIVED</button>
                        )}
                        {["confirmed", "arrived"].includes(reservation.status) && (
                          <button onClick={() => setStatus(reservation.id, "seated")}>SEAT</button>
                        )}
                        <button onClick={() => setStatus(reservation.id, "completed")}>COMPLETE</button>
                        {reservation.status !== "seated" && (
                          <button className="danger" onClick={() => confirmStatus(reservation, "no_show")}>NO-SHOW</button>
                        )}
                        <button onClick={() => unassignReservation(reservation.id)}>UNASSIGN</button>
                      </div>
                    </article>
                  ))}
                  {selectedTableRun.length === 0 && (
                    <span className="table-run-empty">No bookings assigned to this table today.</span>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {editingReservation && (
        <div className="modal-backdrop" role="presentation">
          <section className="staff-modal reservation-editor" role="dialog" aria-modal="true" aria-labelledby="reservation-editor-title">
            <button
              className="modal-close"
              onClick={() => {
                setEditingReservation(null);
                setReservationEditError("");
                setReservationEditConflicts([]);
              }}
              aria-label="Close"
            >
              <X />
            </button>
            <header className="reservation-editor-header">
              <div>
                <p className="step-label">ADMIN CONTROL</p>
                <h2 id="reservation-editor-title">EDIT RESERVATION</h2>
              </div>
              <p className="editor-code">{editingReservation.confirmationCode}</p>
            </header>
            <form
              className="reservation-editor-form"
              onSubmit={editReservation}
              onChange={() => {
                if (reservationEditConflicts.length > 0) setReservationEditConflicts([]);
              }}
            >
              <div className="reservation-editor-scroll">
                <div className="reservation-editor-layout">
                  <section className="editor-pane editor-primary-pane">
                    <div className="editor-section-heading">
                      <span>1</span>
                      <div><strong>BOOKING DETAILS</strong><small>The essentials used at the door.</small></div>
                    </div>
                    <label>GUEST NAME<input name="name" defaultValue={editingReservation.guestName} required /></label>
                    <div className="field-grid">
                      <label>PHONE<input name="phone" type="tel" defaultValue={editingReservation.phone} /></label>
                      <label>EMAIL<input name="email" type="email" defaultValue={editingReservation.email} /></label>
                    </div>
                    <div className="field-grid">
                      <label>
                        DATE & TIME
                        <input
                          name="startsAt"
                          type="datetime-local"
                          defaultValue={formatInTimeZone(
                            new Date(editingReservation.startsAt),
                            RESTAURANT_TIMEZONE,
                            "yyyy-MM-dd'T'HH:mm",
                          )}
                          required
                        />
                      </label>
                      <label>PARTY SIZE<input name="partySize" type="number" min="1" max="30" defaultValue={editingReservation.partySize} required /></label>
                    </div>
                    <label>
                      STATUS
                      <select name="status" defaultValue={editingReservation.status}>
                        {statusOrder.map((status) => <option value={status} key={status}>{status.replace("_", " ").toUpperCase()}</option>)}
                        <option value="cancelled">CANCELLED</option>
                        <option value="no_show">NO SHOW</option>
                      </select>
                    </label>
                  </section>

                  <section className="editor-pane editor-service-pane">
                    <div className="editor-section-heading">
                      <span>2</span>
                      <div><strong>TABLE & SERVICE</strong><small>Change only what tonight needs.</small></div>
                    </div>
                    <div className="current-table-summary">
                      <span>CURRENT TABLE{reservationTableIds(editingReservation).length === 1 ? "" : "S"}</span>
                      <strong>{reservationTableNames(editingReservation)}</strong>
                    </div>
                    <details className="editor-disclosure table-picker-disclosure">
                      <summary><span>CHANGE ASSIGNED TABLES</span><small>OPTIONAL</small></summary>
                      <fieldset className="table-checkbox-fieldset editor-table-picker">
                        <legend>SELECT TABLES</legend>
                        <p>Select more than one only for an approved large party.</p>
                        <div className="table-checkbox-grid">
                          {tables.map((table) => (
                            <label key={table.id}>
                              <input
                                name="tableIds"
                                type="checkbox"
                                value={table.id}
                                defaultChecked={reservationTableIds(editingReservation).includes(table.id)}
                              />
                              <span>{table.name}<small>{table.capacity} TOP{table.reservable ? "" : " · WALK-IN"}</small></span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </details>

                    <div className="editor-service-flags" aria-label="Important service details">
                      {editingReservation.vip && <span>VIP</span>}
                      {editingReservation.allergies && <span className="critical">ALLERGY · {editingReservation.allergies}</span>}
                      {editingReservation.accessibility && <span>ACCESS · {editingReservation.accessibility}</span>}
                      {editingReservation.occasion && <span>{editingReservation.occasion}</span>}
                      {!editingReservation.vip && !editingReservation.allergies && !editingReservation.accessibility && !editingReservation.occasion && (
                        <span className="clear">NO SERVICE FLAGS</span>
                      )}
                    </div>

                    <details className="editor-disclosure">
                      <summary><span>NOTES & GUEST DETAILS</span><small>REQUESTS, VIP, ALLERGIES</small></summary>
                      <div className="editor-disclosure-content">
                        <label>GUEST REQUESTS<textarea name="request" rows={2} defaultValue={editingReservation.request ?? ""} /></label>
                        <label>INTERNAL NOTE<textarea name="staffNote" rows={2} defaultValue={editingReservation.staffNote ?? ""} /></label>
                        <label className="vip-checkbox">
                          <input name="vip" type="checkbox" defaultChecked={editingReservation.vip === true} />
                          <span>VIP / REGULAR GUEST</span>
                        </label>
                        <div className="field-grid">
                          <label>ALLERGIES<input name="allergies" defaultValue={editingReservation.allergies ?? ""} placeholder="Severe shellfish, gluten..." /></label>
                          <label>OCCASION<input name="occasion" defaultValue={editingReservation.occasion ?? ""} placeholder="Birthday, anniversary..." /></label>
                        </div>
                        <label>ACCESSIBILITY<input name="accessibility" defaultValue={editingReservation.accessibility ?? ""} placeholder="Wheelchair space, low table..." /></label>
                      </div>
                    </details>

                    <details className="editor-disclosure guest-history-disclosure">
                      <summary><span>GUEST HISTORY</span><small>{editingGuestHistory.length} PRIOR BOOKING{editingGuestHistory.length === 1 ? "" : "S"}</small></summary>
                      <div className="guest-history">
                        {editingGuestHistory.slice(0, 6).map((reservation) => (
                          <div key={reservation.id}>
                            <time>{formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "MMM d, yyyy")}</time>
                            <span>{reservation.partySize} guests · {reservation.status.replace("_", " ")}</span>
                            <span>{reservationTableNames(reservation)}</span>
                          </div>
                        ))}
                        {editingGuestHistory.length === 0 && <p>No matching email or phone history.</p>}
                      </div>
                    </details>
                  </section>
                </div>
                {reservationEditConflicts.length > 0 && (
                  <div className="conflict-review" role="alert">
                    <strong>CHECK BEFORE SAVING</strong>
                    <span>These are warnings, not permission gates. Review the details and proceed if this is right for service.</span>
                    <ul>{reservationEditConflicts.map((message) => <li key={message}>{message}</li>)}</ul>
                    <button type="button" onClick={() => setReservationEditConflicts([])}>GO BACK & ADJUST</button>
                  </div>
                )}
              </div>
              <footer className="reservation-editor-actions">
                {reservationEditError && <p className="form-error" role="alert">{reservationEditError}</p>}
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => {
                    setEditingReservation(null);
                    setReservationEditError("");
                    setReservationEditConflicts([]);
                  }}
                >
                  CANCEL
                </button>
                <button
                  className="button button-pink"
                  disabled={saving}
                  name={reservationEditConflicts.length > 0 ? "override" : undefined}
                  value={reservationEditConflicts.length > 0 ? "yes" : undefined}
                >
                  <Save size={17} /> {saving ? "SAVING…" : reservationEditConflicts.length > 0 ? "PROCEED & SAVE" : "SAVE RESERVATION"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {showPhoneForm && (
        <div className="modal-backdrop" role="presentation">
          <section className="staff-modal phone-booking-editor" role="dialog" aria-modal="true" aria-labelledby="phone-booking-title">
            <button className="modal-close" onClick={() => {
              setShowPhoneForm(false);
              setPhoneBookingTable("");
              setPhoneBookingError("");
              setPhoneBookingConflicts([]);
            }} aria-label="Close"><X /></button>
            <header className="reservation-editor-header">
              <div>
                <p className="step-label">QUICK ENTRY</p>
                <h2 id="phone-booking-title">PHONE BOOKING</h2>
              </div>
              <p className="editor-code">STAFF</p>
            </header>
            <form
              className="reservation-editor-form"
              onSubmit={addPhoneBooking}
              onChange={() => {
                if (phoneBookingConflicts.length > 0) setPhoneBookingConflicts([]);
              }}
            >
              <div className="reservation-editor-scroll">
                <div className="phone-booking-layout">
                  <section className="editor-pane editor-primary-pane">
                    <div className="editor-section-heading">
                      <span>1</span>
                      <div><strong>WHO & WHEN</strong><small>Everything needed to hold the booking.</small></div>
                    </div>
                    <label>GUEST NAME<input name="name" autoFocus required /></label>
                    <div className="field-grid">
                      <label>PHONE <span className="optional">(OPTIONAL)</span><input name="phone" type="tel" /></label>
                      <label>EMAIL <span className="optional">(OPTIONAL)</span><input name="email" type="email" /></label>
                    </div>
                    <div className="field-grid">
                      <label>DATE & TIME<input name="startsAt" type="datetime-local" defaultValue={formatInTimeZone(phoneBookingStartsAt, RESTAURANT_TIMEZONE, "yyyy-MM-dd'T'HH:mm")} required /></label>
                      <label>PARTY SIZE<input name="partySize" type="number" min="1" max="30" defaultValue="2" required /></label>
                    </div>
                    <label>INTERNAL NOTE<textarea name="staffNote" rows={3} placeholder="Accessibility, birthday, regular guest..." /></label>
                  </section>
                  <section className="editor-pane editor-service-pane">
                    <div className="editor-section-heading">
                      <span>2</span>
                      <div><strong>TABLE</strong><small>Optional now; assign or move it anytime.</small></div>
                    </div>
                    <fieldset className="table-checkbox-fieldset editor-table-picker">
                      <legend>ASSIGN TABLES <span className="optional">(OPTIONAL)</span></legend>
                      <p>Select more than one only when the party needs combined tables.</p>
                      <div className="table-checkbox-grid">
                        {tables.map((table) => (
                          <label key={table.id}>
                            <input name="tableIds" type="checkbox" value={table.id} defaultChecked={phoneBookingTable === table.id} />
                            <span>{table.name}<small>{table.capacity} TOP{table.reservable ? "" : " · WALK-IN"}</small></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </section>
                </div>
                {phoneBookingConflicts.length > 0 && (
                  <div className="conflict-review" role="alert">
                    <strong>CHECK BEFORE ADDING</strong>
                    <span>The booking can still be added. Review exactly what conflicts, then cancel or proceed.</span>
                    <ul>{phoneBookingConflicts.map((message) => <li key={message}>{message}</li>)}</ul>
                    <button type="button" onClick={() => setPhoneBookingConflicts([])}>GO BACK & ADJUST</button>
                  </div>
                )}
              </div>
              <footer className="reservation-editor-actions">
                {phoneBookingError && <p className="form-error" role="alert">{phoneBookingError}</p>}
                <button className="button button-outline" type="button" onClick={() => {
                  setShowPhoneForm(false);
                  setPhoneBookingTable("");
                  setPhoneBookingError("");
                  setPhoneBookingConflicts([]);
                }}>CANCEL</button>
                <button
                  className="button button-pink"
                  disabled={saving}
                  name={phoneBookingConflicts.length > 0 ? "override" : undefined}
                  value={phoneBookingConflicts.length > 0 ? "yes" : undefined}
                >
                  <CalendarPlus size={17} /> {saving ? "SAVING…" : phoneBookingConflicts.length > 0 ? "PROCEED & ADD" : "ADD TO THE BOOK"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
