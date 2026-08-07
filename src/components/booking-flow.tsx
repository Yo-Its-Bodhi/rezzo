"use client";

import { addDays, addHours, format } from "date-fns";
import { CalendarDays, Check, ChevronLeft, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { assignBestTable, isTimeAvailable, type Occupancy } from "@/lib/availability";
import {
  readStoredReservations,
  readStoredOperations,
  readStoredFloorLayout,
  RESERVATION_POLICIES,
  RESTAURANT_TIMEZONE,
  SERVICE_SCHEDULE,
  StoredReservation,
  writeStoredReservations,
} from "@/lib/restaurant";

type Step = "search" | "details" | "confirmed";
const partySizes = [1, 2, 3, 4, 5, 6];
function dateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function serviceSlots(date: string) {
  const selectedDate = new Date(`${date}T12:00:00`);
  const schedule = SERVICE_SCHEDULE[selectedDate.getDay()];
  const [openHour, openMinute] = schedule.opens.split(":").map(Number);
  const [closeHour, closeMinute] = schedule.closes.split(":").map(Number);
  const opening = makeStart(date, openHour, openMinute);
  const lastStart = makeStart(date, closeHour - 1, closeMinute);
  const slots: Date[] = [];
  for (let slot = opening; slot <= lastStart; slot = new Date(slot.getTime() + 15 * 60_000)) {
    slots.push(slot);
  }
  return slots;
}

function makeStart(date: string, hour: number, minute: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);
}

export function BookingFlow() {
  const tomorrow = addDays(new Date(), 1);
  const [step, setStep] = useState<Step>("search");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(dateValue(tomorrow));
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const existing = hydrated ? readStoredReservations() : [];
  const reservableTables = (hydrated ? readStoredFloorLayout() : []).filter(
    (table) => table.reservable,
  );
  const operations = hydrated
    ? readStoredOperations()
    : { onlineBookingPaused: false, blockedTableIds: [], tableHolds: [] };
  const occupancies: Occupancy[] = existing.map((reservation) => ({
    tableId: reservation.tableId,
    startsAt: new Date(reservation.startsAt),
    endsAt: new Date(reservation.endsAt),
    status: reservation.status,
  }));
  const serviceStart = makeStart(date, 0, 0);
  const serviceEnd = addHours(serviceStart, 24);
  const blocks = [
    ...operations.blockedTableIds.map((tableId) => ({
      tableId,
      startsAt: serviceStart,
      endsAt: serviceEnd,
    })),
    ...operations.tableHolds.map((hold) => ({
      tableId: hold.tableId,
      startsAt: new Date(hold.startsAt),
      endsAt: new Date(hold.endsAt),
    })),
  ];

  const slots = serviceSlots(date).map((startsAt) => {
    return {
      startsAt,
      label: format(startsAt, "h:mm a"),
      available: !operations.onlineBookingPaused && isTimeAvailable({
        startsAt,
        partySize,
        tables: reservableTables,
        occupancies,
        blocks,
        config: {
          durationMinutes: 120,
          startsPerClockHour: 3,
          timezone: RESTAURANT_TIMEZONE,
        },
      }),
    };
  });

  function selectTime(startsAt: Date) {
    setSelectedStart(startsAt);
    setStep("details");
  }

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart || !policyAccepted) return;
    const form = new FormData(event.currentTarget);
    const latest = readStoredReservations();
    const latestOccupancies = latest.map((reservation) => ({
      tableId: reservation.tableId,
      startsAt: new Date(reservation.startsAt),
      endsAt: new Date(reservation.endsAt),
      status: reservation.status,
    }));
    const table = assignBestTable({
      startsAt: selectedStart,
      partySize,
      tables: reservableTables,
      occupancies: latestOccupancies,
      blocks,
      config: {
        durationMinutes: 120,
        startsPerClockHour: 3,
        timezone: RESTAURANT_TIMEZONE,
      },
    });
    if (!table) {
      setStep("search");
      setSelectedStart(null);
      return;
    }

    const code = `LC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const reservation: StoredReservation = {
      id: crypto.randomUUID(),
      confirmationCode: code,
      guestName: String(form.get("name")),
      email: String(form.get("email")),
      phone: String(form.get("phone")),
      request: String(form.get("request") ?? ""),
      partySize,
      startsAt: selectedStart.toISOString(),
      endsAt: addHours(selectedStart, 2).toISOString(),
      tableId: table.id,
      status: "confirmed",
      source: "online",
      policyVersion: 1,
      policyAcceptedAt: new Date().toISOString(),
    };
    writeStoredReservations([...latest, reservation]);
    setConfirmation(code);
    setStep("confirmed");
  }

  if (step === "confirmed" && selectedStart) {
    return (
      <section className="booking-card confirmation-card" aria-live="polite">
        <div className="confirmation-mark">
          <Check size={42} strokeWidth={4} />
        </div>
        <p className="eyebrow">YOU&apos;RE IN</p>
        <h2>TABLE LOCKED.</h2>
        <p className="confirmation-code">{confirmation}</p>
        <div className="confirmation-details">
          <span><CalendarDays size={18} /> {format(selectedStart, "EEEE, MMMM d")}</span>
          <span><Clock3 size={18} /> {format(selectedStart, "h:mm a")}</span>
          <span><Users size={18} /> Party of {partySize}</span>
        </div>
        <p className="muted">
          Save your confirmation code. SMS and email delivery can be enabled when the
          Twilio and Resend production credentials are connected.
        </p>
        <Link className="text-link" href={`/manage?code=${confirmation}`}>
          VIEW OR CANCEL THIS BOOKING →
        </Link>
        <button className="button button-dark" onClick={() => setStep("search")}>
          MAKE ANOTHER BOOKING
        </button>
      </section>
    );
  }

  if (step === "details" && selectedStart) {
    return (
      <section className="booking-card">
        <button className="back-button" onClick={() => setStep("search")}>
          <ChevronLeft size={18} /> Change time
        </button>
        <p className="step-label">02 / YOUR DETAILS</p>
        <h2>WHO ARE WE FEEDING?</h2>
        <div className="booking-summary">
          <strong>{format(selectedStart, "EEE, MMM d · h:mm a")}</strong>
          <span>Party of {partySize} · Table held for 2 hours</span>
        </div>
        <form onSubmit={submitBooking}>
          <div className="field-grid">
            <label>
              YOUR NAME
              <input name="name" autoComplete="name" required placeholder="Frida Kahlo" />
            </label>
            <label>
              MOBILE
              <input name="phone" autoComplete="tel" required type="tel" placeholder="416 555 0123" />
            </label>
          </div>
          <label>
            EMAIL
            <input name="email" autoComplete="email" required type="email" placeholder="hola@example.com" />
          </label>
          <label>
            REQUESTS <span className="optional">(WE&apos;LL TRY, NO PROMISES)</span>
            <textarea name="request" rows={2} placeholder="Allergies, accessibility, celebration..." />
          </label>
          <details className="policy-box">
            <summary>READ THE RESERVATION POLICIES</summary>
            <ul>
              {RESERVATION_POLICIES.map((policy) => <li key={policy}>{policy}</li>)}
            </ul>
          </details>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={(event) => setPolicyAccepted(event.target.checked)}
            />
            <span>I have read and agree to the reservation policies.</span>
          </label>
          <button className="button button-pink" disabled={!policyAccepted}>
            CONFIRM THE TABLE →
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="booking-card">
      <p className="step-label">01 / FIND A TABLE</p>
      <h2>WHEN ARE YOU HUNGRY?</h2>
      <div className="selection-group">
        <span className="input-label"><Users size={16} /> PARTY SIZE</span>
        <div className="party-grid">
          {partySizes.map((size) => (
            <button
              className={partySize === size ? "choice active" : "choice"}
              key={size}
              onClick={() => setPartySize(size)}
              aria-pressed={partySize === size}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="field-note">
          7 or more? <a href="mailto:hola@lachingada.ca">Email the restaurant.</a>
        </p>
      </div>
      <label>
        <span className="input-label"><CalendarDays size={16} /> DATE</span>
        <input
          type="date"
          value={date}
          min={dateValue(new Date())}
          max={dateValue(addDays(new Date(), 60))}
          onChange={(event) => {
            setDate(event.target.value);
            setSelectedStart(null);
          }}
        />
      </label>
      <div className="selection-group">
        <span className="input-label"><Clock3 size={16} /> AVAILABLE TIMES</span>
        <div className="time-grid">
          {slots.map((slot) => (
            <button
              key={slot.startsAt.toISOString()}
              className="time-choice"
              disabled={!slot.available}
              onClick={() => selectTime(slot.startsAt)}
            >
              {slot.available ? slot.label : <><s>{slot.label}</s><small>FULL</small></>}
            </button>
          ))}
        </div>
      </div>
      {operations.onlineBookingPaused && (
        <div className="alert-banner guest-alert">
          ONLINE BOOKINGS ARE TEMPORARILY PAUSED. CALL US FOR HELP.
        </div>
      )}
      <div className="no-table-note">
        NOTHING WORK? <Link href="/waitlist">JOIN TODAY&apos;S WAITLIST →</Link>
      </div>
    </section>
  );
}
