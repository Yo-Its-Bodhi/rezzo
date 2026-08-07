"use client";

import {
  addDays,
  addHours,
  format,
  isSameDay,
  setHours,
  setMinutes,
  startOfWeek,
} from "date-fns";
import {
  Ban,
  BellRing,
  CalendarPlus,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  readStoredReservations,
  readStoredOperations,
  readStoredFloorLayout,
  readStoredWaitlist,
  StoredReservation,
  StoredWaitlistEntry,
  FloorName,
  FloorTable,
  DEFAULT_TABLES,
  TableHold,
  writeStoredReservations,
  writeStoredOperations,
  writeStoredFloorLayout,
  writeStoredWaitlist,
} from "@/lib/restaurant";

type AdminTab = "bookings" | "calendar" | "floor" | "waitlist";

function todayAt(hour: number, minute = 0) {
  return setMinutes(setHours(new Date(), hour), minute);
}

function sampleReservations(): StoredReservation[] {
  return [
    {
      id: "sample-1",
      confirmationCode: "LC-84A2D1",
      guestName: "Maya Chen",
      phone: "416 555 0192",
      email: "maya@example.com",
      partySize: 4,
      startsAt: todayAt(17, 30).toISOString(),
      endsAt: todayAt(19, 30).toISOString(),
      tableId: "t13",
      status: "confirmed",
      source: "online",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    },
    {
      id: "sample-2",
      confirmationCode: "LC-B91F20",
      guestName: "Andre Silva",
      phone: "647 555 0108",
      email: "andre@example.com",
      partySize: 6,
      startsAt: todayAt(18).toISOString(),
      endsAt: todayAt(20).toISOString(),
      tableId: "t33",
      status: "arrived",
      source: "phone",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    },
    {
      id: "sample-3",
      confirmationCode: "LC-2DD419",
      guestName: "Nina Patel",
      phone: "416 555 0184",
      email: "nina@example.com",
      partySize: 2,
      startsAt: todayAt(19).toISOString(),
      endsAt: todayAt(21).toISOString(),
      tableId: "t11",
      status: "confirmed",
      source: "online",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    },
  ];
}

const statusOrder: StoredReservation["status"][] = [
  "confirmed",
  "arrived",
  "seated",
  "completed",
];

export function StaffDashboard() {
  const [tab, setTab] = useState<AdminTab>("bookings");
  const [reservations, setReservations] = useState<StoredReservation[]>([]);
  const [waitlist, setWaitlist] = useState<StoredWaitlistEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [blockedTables, setBlockedTables] = useState<string[]>([]);
  const [tableHolds, setTableHolds] = useState<TableHold[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [activeFloor, setActiveFloor] = useState<FloorName>("front");
  const [editingFloor, setEditingFloor] = useState(false);
  const [reservationToAssign, setReservationToAssign] = useState("");
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);
  const [offerFeedback, setOfferFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [floorTime, setFloorTime] = useState(() => new Date());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredReservations();
      setReservations(stored.length ? stored : sampleReservations());
      setWaitlist(readStoredWaitlist());
      const operations = readStoredOperations();
      setPaused(operations.onlineBookingPaused);
      setBlockedTables(operations.blockedTableIds);
      setTableHolds(operations.tableHolds);
      setTables(readStoredFloorLayout());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleReservations = useMemo(
    () =>
      reservations
        .filter((reservation) =>
          `${reservation.guestName} ${reservation.confirmationCode} ${reservation.phone}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [query, reservations],
  );

  function persistReservations(next: StoredReservation[]) {
    setReservations(next);
    writeStoredReservations(next.filter((item) => !item.id.startsWith("sample-")));
  }

  function persistOperations(
    nextPaused: boolean,
    nextBlockedTables: string[],
    nextTableHolds: TableHold[] = tableHolds,
  ) {
    setPaused(nextPaused);
    setBlockedTables(nextBlockedTables);
    setTableHolds(nextTableHolds);
    writeStoredOperations({
      onlineBookingPaused: nextPaused,
      blockedTableIds: nextBlockedTables,
      tableHolds: nextTableHolds,
    });
  }

  function persistFloorLayout(next: FloorTable[]) {
    setTables(next);
    writeStoredFloorLayout(next);
  }

  function setStatus(id: string, status: StoredReservation["status"]) {
    persistReservations(
      reservations.map((reservation) =>
        reservation.id === id ? { ...reservation, status } : reservation,
      ),
    );
  }

  function advanceStatus(reservation: StoredReservation) {
    const index = statusOrder.indexOf(reservation.status);
    setStatus(reservation.id, statusOrder[Math.min(index + 1, statusOrder.length - 1)]);
  }

  function restoreReservation(reservation: StoredReservation) {
    setStatus(
      reservation.id,
      reservation.status === "completed" ? "seated" : "confirmed",
    );
  }

  function addPhoneBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = new Date(String(form.get("startsAt")));
    const tableId = String(form.get("tableId"));
    const reservation: StoredReservation = {
      id: crypto.randomUUID(),
      confirmationCode: `LC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      guestName: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email") || "phone-booking@lachingada.ca"),
      partySize: Number(form.get("partySize")),
      startsAt: start.toISOString(),
      endsAt: addHours(start, 2).toISOString(),
      tableId,
      status: "confirmed",
      source: "phone",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    };
    persistReservations([...reservations, reservation]);
    setShowPhoneForm(false);
  }

    async function offerTable(entry: StoredWaitlistEntry) {
      setSendingOfferId(entry.id);
      setOfferFeedback(null);
      const expiresAt = new Date(new Date().getTime() + 5 * 60_000).toISOString();
      try {
        const response = await fetch("/api/notifications/waitlist-offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: entry.id,
            guestName: entry.guestName,
            phone: entry.phone,
            email: entry.email,
            partySize: entry.partySize,
            expiresAt,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          results?: Array<{ channel: "sms" | "email"; sent: boolean; error?: string }>;
        };
        const sent = payload.results?.filter((result) => result.sent) ?? [];
        if (sent.length === 0) {
          const reasons = payload.results
            ?.map((result) => `${result.channel.toUpperCase()}: ${result.error}`)
            .join(" · ");
          throw new Error(reasons || payload.error || "The offer could not be delivered.");
        }

        const next = waitlist.map((item) =>
          item.id === entry.id
            ? { ...item, status: "offered" as const, offerExpiresAt: expiresAt }
            : item,
        );
        setWaitlist(next);
        writeStoredWaitlist(next);
        const failed = payload.results?.filter((result) => !result.sent) ?? [];
        setOfferFeedback({
          type: failed.length ? "error" : "success",
          message: failed.length
            ? `Offer sent by ${sent.map((result) => result.channel.toUpperCase()).join(" and ")}. ${failed.map((result) => `${result.channel.toUpperCase()}: ${result.error}`).join(" ")}`
            : "Waitlist offer sent by SMS and email.",
        });
      } catch (error) {
        setOfferFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "The offer could not be delivered.",
        });
      } finally {
        setSendingOfferId(null);
      }
    }

    function reservationAtTable(tableId: string, at: Date) {
            return reservations.find(
              (reservation) =>
                reservation.tableId === tableId &&
                !["cancelled", "completed", "no_show"].includes(reservation.status) &&
                new Date(reservation.startsAt) <= at &&
                new Date(reservation.endsAt) > at,
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

    function releaseSelectedTable() {
            if (!selectedTableId) return;
            persistOperations(
              paused,
              blockedTables.filter((id) => id !== selectedTableId),
              tableHolds.filter((hold) => hold.tableId !== selectedTableId),
            );
            const active = reservationAtTable(selectedTableId, floorTime);
            if (active) setStatus(active.id, "completed");
          }

    function assignReservationToSelected(reservationId: string) {
            if (!selectedTableId) return;
            const reservationToMove = reservations.find((reservation) => reservation.id === reservationId);
            if (!reservationToMove) return;
            persistReservations(
              reservations.map((reservation) =>
                reservation.id === reservationId
                  ? { ...reservation, tableId: selectedTableId }
                  : reservation,
              ),
            );
            setFloorTime(new Date(reservationToMove.startsAt));
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
            persistFloorLayout(tables.filter((table) => table.id !== selectedTableId));
            setSelectedTableId(null);
    }

  const covers = reservations
    .filter((reservation) => !["cancelled", "no_show"].includes(reservation.status))
    .reduce((total, reservation) => total + reservation.partySize, 0);
  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const selectedReservation = selectedTableId
    ? reservationAtTable(selectedTableId, floorTime)
    : undefined;
  const selectedHold = selectedTableId ? holdAtTable(selectedTableId, floorTime) : undefined;
  const assignableReservations = selectedTable
    ? reservations.filter((reservation) => {
        if (
          reservation.partySize > selectedTable.capacity ||
          !["confirmed", "arrived"].includes(reservation.status)
        ) {
          return false;
        }
        return !reservations.some(
          (other) =>
            other.id !== reservation.id &&
            other.tableId === selectedTable.id &&
            !["cancelled", "completed", "no_show"].includes(other.status) &&
            new Date(other.startsAt) < new Date(reservation.endsAt) &&
            new Date(other.endsAt) > new Date(reservation.startsAt),
        );
      })
    : [];

  return (
    <main className="admin-shell">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">FRIDAY · LIVE SERVICE</p>
          <h1>TONIGHT&apos;S<br /><span>CONTROL ROOM.</span></h1>
        </div>
        <div className="service-actions">
          <button
            className={paused ? "button button-yellow" : "button button-outline"}
            onClick={() => persistOperations(!paused, blockedTables, tableHolds)}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
            {paused ? "RESUME ONLINE" : "PAUSE ONLINE"}
          </button>
          <button className="button button-pink" onClick={() => setShowPhoneForm(true)}>
            <CalendarPlus size={18} /> PHONE BOOKING
          </button>
        </div>
      </div>

      {paused && (
        <div className="alert-banner">
          <ShieldAlert size={20} /> ONLINE BOOKINGS ARE PAUSED. STAFF CAN STILL ADD RESERVATIONS.
        </div>
      )}

      <section className="stat-strip">
        <div><strong>{reservations.length}</strong><span>BOOKINGS</span></div>
        <div><strong>{covers}</strong><span>COVERS</span></div>
        <div><strong>{waitlist.filter((entry) => entry.status === "waiting").length}</strong><span>WAITING</span></div>
        <div><strong>{tables.length - blockedTables.length}</strong><span>TABLES LIVE</span></div>
      </section>

      <nav className="admin-tabs" aria-label="Dashboard sections">
        <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>RESERVATIONS</button>
        <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>WEEK CALENDAR</button>
        <button className={tab === "floor" ? "active" : ""} onClick={() => setTab("floor")}>LIVE FLOOR</button>
        <button className={tab === "waitlist" ? "active" : ""} onClick={() => setTab("waitlist")}>
          WAITLIST <span>{waitlist.filter((entry) => entry.status === "waiting").length}</span>
        </button>
      </nav>

      {tab === "bookings" && (
        <section className="admin-panel">
          <div className="panel-toolbar">
            <h2>RESERVATIONS</h2>
            <label className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search guest, code, phone..."
              />
            </label>
          </div>
          <div className="reservation-list">
            {visibleReservations.map((reservation) => {
              const table = tables.find((item) => item.id === reservation.tableId);
              return (
                <article className={`reservation-row status-${reservation.status}`} key={reservation.id}>
                  <time>
                    <strong>{format(new Date(reservation.startsAt), "h:mm")}</strong>
                    <span>{format(new Date(reservation.startsAt), "a")}</span>
                  </time>
                  <div className="guest-cell">
                    <strong>{reservation.guestName}</strong>
                    <span>{reservation.confirmationCode} · {reservation.source}</span>
                  </div>
                  <div className="party-cell"><Users size={17} /> {reservation.partySize}</div>
                  <div className="table-badge">{table?.name ?? "—"}</div>
                  <span className="status-badge">{reservation.status.replace("_", " ")}</span>
                  <div className="row-actions">
                    {!["completed", "cancelled", "no_show"].includes(reservation.status) && (
                      <>
                        <button title="Advance status" onClick={() => advanceStatus(reservation)}>
                          <UserRoundCheck size={18} />
                        </button>
                        <button title="Mark no-show" onClick={() => setStatus(reservation.id, "no_show")}>
                          <Ban size={18} />
                        </button>
                        <button title="Cancel" onClick={() => setStatus(reservation.id, "cancelled")}>
                          <X size={18} />
                        </button>
                      </>
                    )}
                    {["completed", "cancelled", "no_show"].includes(reservation.status) && (
                      <button
                        className="restore-action"
                        title={`Undo ${reservation.status.replace("_", " ")}`}
                        aria-label={`Undo ${reservation.status.replace("_", " ")} for ${reservation.guestName}`}
                        onClick={() => restoreReservation(reservation)}
                      >
                        <RotateCcw size={18} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
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
                .filter((reservation) => isSameDay(new Date(reservation.startsAt), day))
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div className={isSameDay(day, new Date()) ? "calendar-day today" : "calendar-day"} key={day.toISOString()}>
                  <header>
                    <span>{format(day, "EEE").toUpperCase()}</span>
                    <strong>{format(day, "d")}</strong>
                    <small>{dayReservations.reduce((sum, item) => sum + item.partySize, 0)} COVERS</small>
                  </header>
                  <div className="day-bookings">
                    {dayReservations.map((reservation) => (
                      <button
                        className={`calendar-booking status-${reservation.status}`}
                        key={reservation.id}
                        onClick={() => {
                          setFloorTime(new Date(reservation.startsAt));
                          setSelectedTableId(reservation.tableId);
                          setTab("floor");
                        }}
                      >
                        <time>{format(new Date(reservation.startsAt), "h:mm a")}</time>
                        <strong>{reservation.guestName}</strong>
                        <span>{reservation.partySize} ppl · {tables.find((table) => table.id === reservation.tableId)?.name}</span>
                      </button>
                    ))}
                    {dayReservations.length === 0 && <span className="day-empty">NO BOOKINGS</span>}
                  </div>
                  <button className="day-add" onClick={() => setShowPhoneForm(true)}>
                    <CalendarPlus size={14} /> ADD
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "waitlist" && (
        <section className="admin-panel">
          <div className="panel-toolbar">
            <div><h2>DOOR WAITLIST</h2><p>Offers expire after 5 minutes.</p></div>
          </div>
          {offerFeedback && (
            <div className={`delivery-feedback ${offerFeedback.type}`} role="status">
              {offerFeedback.message}
            </div>
          )}
          <div className="reservation-list">
            {waitlist.length === 0 && <div className="empty-state">NO ONE WAITING. ENJOY THE SILENCE.</div>}
            {waitlist.map((entry) => (
              <article className="waitlist-row" key={entry.id}>
                <div className="wait-time"><Clock3 size={17} /> {format(new Date(entry.joinedAt), "h:mm a")}</div>
                <div className="guest-cell"><strong>{entry.guestName}</strong><span>{entry.phone}</span></div>
                <div className="party-cell"><Users size={17} /> {entry.partySize}</div>
                <span className={`status-badge ${entry.status}`}>{entry.status}</span>
                {entry.status === "waiting" && (
                  <button
                    className="mini-button"
                    disabled={sendingOfferId === entry.id}
                    onClick={() => offerTable(entry)}
                  >
                    <BellRing size={16} /> {sendingOfferId === entry.id ? "SENDING..." : "OFFER TABLE"}
                  </button>
                )}
                {entry.status === "offered" && <span className="offer-clock">5:00 TO REPLY</span>}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "floor" && (
        <section className="admin-panel floor-panel">
          <div className="panel-toolbar">
            <div><h2>LIVE FLOOR</h2><p>Click a table to hold, seat, assign, or release it.</p></div>
            <div className="floor-toolbar-actions">
              <label className="floor-time-control">
                VIEW FLOOR AT
                <input
                  type="datetime-local"
                  value={format(floorTime, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(event) => setFloorTime(new Date(event.target.value))}
                />
              </label>
              <button className={editingFloor ? "edit-floor-button active" : "edit-floor-button"} onClick={() => setEditingFloor(!editingFloor)}>
                {editingFloor ? "DONE EDITING" : "EDIT FLOOR"}
              </button>
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
                <button
                  className="reset-floor-button"
                  onClick={() => {
                    persistFloorLayout(DEFAULT_TABLES.map((table) => ({ ...table })));
                    setSelectedTableId(null);
                  }}
                >
                  RESET TO SUPPLIED PLANS
                </button>
              </>
            )}
          </div>
          {editingFloor && <div className="layout-edit-notice">LAYOUT EDIT MODE · DRAG TABLES TO MOVE THEM · CLICK TO EDIT DETAILS</div>}
          <div className="floor-legend">
            <span><i className="available" /> AVAILABLE</span>
            <span><i className="reserved" /> RESERVED</span>
            <span><i className="seated" /> SEATED</span>
            <span><i className="held" /> HELD / BLOCKED</span>
          </div>
          <div className={`floor-map floor-${activeFloor}`}>
            {activeFloor === "front" && <><div className="floor-entry front-entry">ENTRANCE</div><div className="host-stand">HOST STAND</div></>}
            {activeFloor === "back" && <><div className="floor-bar">BAR · WALK-INS</div><div className="floor-kitchen">TO KITCHEN</div></>}
            {activeFloor === "patio" && <><div className="patio-tree">TREE</div><div className="floor-entry patio-entry">ENTRANCE</div></>}
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
                  onClick={() => setSelectedTableId(table.id)}
                >
                  <strong>{table.name}</strong>
                  <span>{table.capacity} TOP</span>
                  <small>{blocked ? "BLOCKED" : hold ? "HELD" : activeReservation?.guestName ?? "OPEN"}</small>
                </button>
              );
            })}
          </div>
          <div className="floor-summary">
            <span><strong>{tables.filter((table) => table.floor === activeFloor && !reservationAtTable(table.id, floorTime) && !holdAtTable(table.id, floorTime) && !blockedTables.includes(table.id)).length}</strong> OPEN</span>
            <span><strong>{tables.filter((table) => table.floor === activeFloor && reservationAtTable(table.id, floorTime)).length}</strong> IN USE</span>
            <span><strong>{tableHolds.filter((hold) => new Date(hold.startsAt) <= floorTime && new Date(hold.endsAt) > floorTime).length + blockedTables.length}</strong> HELD</span>
          </div>
        </section>
      )}

      {selectedTable && tab === "floor" && (
        <div className="modal-backdrop" role="presentation">
          <section className="staff-modal table-modal" role="dialog" aria-modal="true" aria-labelledby="table-title">
            <button className="modal-close" onClick={() => setSelectedTableId(null)} aria-label="Close"><X /></button>
            <p className="step-label">FLOOR CONTROL · {format(floorTime, "MMM d · h:mm a")}</p>
            <h2 id="table-title">{selectedTable.name} · {selectedTable.capacity} TOP</h2>
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
                <span>{selectedReservation.partySize} guests · {selectedReservation.phone}</span>
                <span>{format(new Date(selectedReservation.startsAt), "h:mm a")} – {format(new Date(selectedReservation.endsAt), "h:mm a")}</span>
                <div className="table-action-grid">
                  {selectedReservation.status === "confirmed" && <button onClick={() => setStatus(selectedReservation.id, "arrived")}>MARK ARRIVED</button>}
                  {["confirmed", "arrived"].includes(selectedReservation.status) && <button onClick={() => setStatus(selectedReservation.id, "seated")}>SEAT PARTY</button>}
                  <button onClick={releaseSelectedTable}>COMPLETE & RELEASE</button>
                  <button onClick={() => setStatus(selectedReservation.id, "no_show")}>NO-SHOW</button>
                </div>
              </div>
            ) : selectedHold || blockedTables.includes(selectedTable.id) ? (
              <div className="table-guest-card">
                <span className="status-badge">HELD</span>
                <strong>{selectedHold?.reason ?? "Blocked until released"}</strong>
                {selectedHold && <span>{format(new Date(selectedHold.startsAt), "h:mm a")} – {format(new Date(selectedHold.endsAt), "h:mm a")}</span>}
                <button className="button button-yellow" onClick={releaseSelectedTable}>RELEASE TABLE</button>
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
                </div>
              </>
            )}
            {!editingFloor && (
              <div className="assignment-panel">
                <div className="assignment-heading">
                  <strong>ASSIGN / MOVE A RESERVATION</strong>
                  <span>Only parties that fit and do not overlap this table are shown.</span>
                </div>
                <div className="assignment-controls">
                  <select value={reservationToAssign} onChange={(event) => setReservationToAssign(event.target.value)}>
                    <option value="">Choose an active reservation...</option>
                    {assignableReservations.map((reservation) => (
                      <option value={reservation.id} key={reservation.id}>
                        {format(new Date(reservation.startsAt), "EEE h:mm a")} · {reservation.guestName} · {reservation.partySize} guests
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!reservationToAssign}
                    onClick={() => assignReservationToSelected(reservationToAssign)}
                  >
                    ASSIGN TO TABLE {selectedTable.name}
                  </button>
                </div>
                {assignableReservations.length === 0 && (
                  <small>NO COMPATIBLE ACTIVE RESERVATIONS TO ASSIGN.</small>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {showPhoneForm && (
        <div className="modal-backdrop" role="presentation">
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="phone-booking-title">
            <button className="modal-close" onClick={() => setShowPhoneForm(false)} aria-label="Close"><X /></button>
            <p className="step-label">STAFF OVERRIDE</p>
            <h2 id="phone-booking-title">ADD PHONE BOOKING</h2>
            <form onSubmit={addPhoneBooking}>
              <label>GUEST NAME<input name="name" required /></label>
              <div className="field-grid">
                <label>PHONE<input name="phone" type="tel" required /></label>
                <label>EMAIL<input name="email" type="email" /></label>
              </div>
              <div className="field-grid">
                <label>DATE & TIME<input name="startsAt" type="datetime-local" required /></label>
                <label>PARTY SIZE<select name="partySize">{[1,2,3,4,5,6].map((size) => <option key={size}>{size}</option>)}</select></label>
              </div>
              <label>ASSIGN TABLE<select name="tableId">{tables.filter((table) => table.reservable).map((table) => <option value={table.id} key={table.id}>{table.name} · {table.capacity} top</option>)}</select></label>
              <button className="button button-pink">ADD TO THE BOOK</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
