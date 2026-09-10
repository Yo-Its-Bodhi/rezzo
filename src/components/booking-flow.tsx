"use client";

import { addDays, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays, Check, ChevronLeft, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  RESERVATION_POLICIES,
  RESTAURANT_TIMEZONE,
} from "@/lib/restaurant";

type Step = "search" | "details" | "confirmed";
const partySizes = [1, 2, 3, 4, 5, 6];
function dateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function formatToronto(date: Date, pattern: string) {
  return formatInTimeZone(date, RESTAURANT_TIMEZONE, pattern);
}

type Slot = { startsAt: string; label: string; available: boolean };
type TimePeriod = "Earlier" | "Later";

function slotPeriod(slot: Slot): TimePeriod {
  const hour = Number(formatInTimeZone(new Date(slot.startsAt), RESTAURANT_TIMEZONE, "H"));
  return hour < 18 ? "Earlier" : "Later";
}

export function BookingFlow() {
  const tomorrow = addDays(new Date(), 1);
  const [step, setStep] = useState<Step>("search");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(dateValue(tomorrow));
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [period, setPeriod] = useState<TimePeriod>("Earlier");
  const [loadingTimes, setLoadingTimes] = useState(true);
  const [bookingError, setBookingError] = useState("");
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as { slots?: Slot[]; paused?: boolean; error?: string };
        if (!response.ok || !payload.slots) throw new Error(payload.error ?? "Availability could not be loaded.");
        setSlots(payload.slots);
        setPaused(payload.paused === true);
        const availablePeriods = [...new Set(payload.slots.map(slotPeriod))];
        setPeriod((current) =>
          availablePeriods.includes(current)
            ? current
            : availablePeriods[0] ?? "Earlier",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBookingError(error instanceof Error ? error.message : "Availability could not be loaded.");
      })
      .finally(() => setLoadingTimes(false));
    return () => controller.abort();
  }, [date, partySize]);

  const periods = useMemo(
    () => [...new Set(slots.map(slotPeriod))],
    [slots],
  );
  const visibleSlots = slots.filter((slot) => slotPeriod(slot) === period);

  function selectTime(startsAt: string) {
    setSelectedStart(new Date(startsAt));
    setStep("details");
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart || !policyAccepted) return;
    setSubmitting(true);
    setBookingError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        request: form.get("request"),
        partySize,
        startsAt: selectedStart.toISOString(),
        policyAccepted,
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      reservation?: { confirmationCode: string };
    };
    setSubmitting(false);
    if (!response.ok || !payload.reservation) {
      setBookingError(payload.error ?? "The booking could not be completed.");
      if (response.status === 409) {
        setStep("search");
        setSelectedStart(null);
      }
      return;
    }
    setConfirmation(payload.reservation.confirmationCode);
    setStep("confirmed");
  }

  function resetSearch() {
    setStep("search");
    setSelectedStart(null);
    setPolicyAccepted(false);
    setBookingError("");
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
          <span><CalendarDays size={18} /> {formatToronto(selectedStart, "EEEE, MMMM d")}</span>
          <span><Clock3 size={18} /> {formatToronto(selectedStart, "h:mm a")}</span>
          <span><Users size={18} /> Party of {partySize}</span>
        </div>
        <p className="muted">
          Save this confirmation code. Use Manage Your Table to change or cancel until
          24 hours before your reservation. Inside 24 hours, call (416) 535-2242.
        </p>
        <Link className="button button-pink confirmation-manage-button" href={`/manage?code=${confirmation}`}>
          MANAGE YOUR TABLE →
        </Link>
        <button className="button button-dark" onClick={resetSearch}>
          MAKE ANOTHER BOOKING
        </button>
      </section>
    );
  }

  if (step === "details" && selectedStart) {
    return (
      <section className="booking-card">
        <button className="back-button" onClick={resetSearch}>
          <ChevronLeft size={18} /> Change time
        </button>
        <p className="step-label">02 / YOUR DETAILS</p>
        <h2>WHO ARE WE FEEDING?</h2>
        <div className="booking-summary">
          <strong>{formatToronto(selectedStart, "EEE, MMM d · h:mm a")}</strong>
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
          {bookingError && <p className="form-error" role="alert">{bookingError}</p>}
          <button className="button button-pink" disabled={!policyAccepted || submitting}>
            {submitting ? "LOCKING IT IN..." : "CONFIRM THE TABLE →"}
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
              onClick={() => {
                setLoadingTimes(true);
                setBookingError("");
                setPartySize(size);
              }}
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
            setLoadingTimes(true);
            setBookingError("");
            setDate(event.target.value);
            setSelectedStart(null);
          }}
        />
      </label>
      <div className="selection-group">
        <span className="input-label"><Clock3 size={16} /> AVAILABLE TIMES</span>
        <div className="period-tabs" aria-label="Time of day">
          {periods.map((item) => (
            <button
              className={period === item ? "active" : ""}
              key={item}
              onClick={() => setPeriod(item)}
              aria-pressed={period === item}
            >
              {item === "Earlier" ? "EARLIER · OPEN–5 PM" : "LATER · 6 PM–CLOSE"}
            </button>
          ))}
        </div>
        <div className="time-grid">
          {loadingTimes && <p className="times-status">CHECKING THE BOOK...</p>}
          {!loadingTimes && visibleSlots.map((slot) => (
            <button
              key={slot.startsAt}
              className="time-choice"
              disabled={!slot.available}
              onClick={() => selectTime(slot.startsAt)}
            >
              {slot.available ? slot.label : <><s>{slot.label}</s><small>FULL</small></>}
            </button>
          ))}
        </div>
        {!loadingTimes && visibleSlots.every((slot) => !slot.available) && (
          <p className="times-status">No tables in this window. Try another time of day.</p>
        )}
      </div>
      {bookingError && <p className="form-error" role="alert">{bookingError}</p>}
      {paused && (
        <div className="alert-banner guest-alert">
          ONLINE BOOKINGS FOR TODAY ARE PAUSED. TOMORROW AND FUTURE DATES ARE STILL OPEN.
        </div>
      )}
      <div className="no-table-note">
        NOTHING AVAILABLE? CALL <a href="tel:+14165352242">(416) 535-2242</a> AND WE&apos;LL SEE
        WHAT WE CAN DO. FOR SAME-DAY RESERVATIONS OR CHANGES, PLEASE CALL—DO NOT EMAIL.
      </div>
    </section>
  );
}
