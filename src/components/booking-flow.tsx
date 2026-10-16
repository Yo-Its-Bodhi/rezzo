"use client";

import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
  Users,
} from "lucide-react";
import Link from "next/link";
import { restaurantLinks } from "@/lib/public-links";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { RESERVATION_POLICIES, RESTAURANT_TIMEZONE } from "@/lib/restaurant";

type Step = "search" | "details" | "confirmed";
type Slot = { startsAt: string; label: string; available: boolean };
type TimePeriod = "Earlier" | "Later";
type GuestDetails = {
  name: string;
  phone: string;
  email: string;
  request: string;
};
const partySizes = [1, 2, 3, 4, 5, 6];
const formatToronto = (date: Date, pattern: string) =>
  formatInTimeZone(date, RESTAURANT_TIMEZONE, pattern);
const slotPeriod = (slot: Slot): TimePeriod =>
  Number(formatToronto(new Date(slot.startsAt), "H")) < 18
    ? "Earlier"
    : "Later";

function BookingSteps({ current }: { current: Step }) {
  const steps: [Step, string][] = [
    ["search", "Your table"],
    ["details", "Your details"],
    ["confirmed", "You’re in"],
  ];
  const index = steps.findIndex(([step]) => step === current);
  return (
    <ol className="reservation-progress" aria-label="Reservation progress">
      {steps.map(([step, label], i) => (
        <li
          key={step}
          className={i < index ? "complete" : ""}
          aria-current={step === current ? "step" : undefined}
        >
          <span>
            {i < index ? <Check size={13} aria-hidden="true" /> : `0${i + 1}`}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function BookingFlow({
  initialToday,
  initialDate,
  finalDate,
}: {
  initialToday: string;
  initialDate: string;
  finalDate: string;
}) {
  const [step, setStep] = useState<Step>("search");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(initialDate);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [period, setPeriod] = useState<TimePeriod>("Earlier");
  const [loadingTimes, setLoadingTimes] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uncertainResult, setUncertainResult] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [details, setDetails] = useState<GuestDetails>({
    name: "",
    phone: "",
    email: "",
    request: "",
  });
  const title = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (previousStep.current !== step) title.current?.focus();
    previousStep.current = step;
  }, [step]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTimes() {
      try {
        const response = await fetch(
          `/api/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = (await response.json()) as {
          slots?: Slot[];
          paused?: boolean;
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.slots))
          throw new Error(
            payload.error ?? "We couldn’t load the available tables.",
          );
        if (controller.signal.aborted) return;
        setSlots(payload.slots);
        setPaused(payload.paused === true);
        const availablePeriods = [...new Set(payload.slots.map(slotPeriod))];
        const firstAvailable = payload.slots.find((slot) => slot.available);
        setPeriod((current) =>
          payload.slots?.some(
            (slot) => slotPeriod(slot) === current && slot.available,
          )
            ? current
            : firstAvailable
              ? slotPeriod(firstAvailable)
              : (availablePeriods[0] ?? "Earlier"),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setSlots([]);
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : "We couldn’t load the available tables.",
        );
      } finally {
        // A cancelled, older search must never clear the next search's loading state.
        if (!controller.signal.aborted) setLoadingTimes(false);
      }
    }
    void loadTimes();
    return () => controller.abort();
  }, [date, partySize, refresh]);

  const periods = useMemo(() => [...new Set(slots.map(slotPeriod))], [slots]);
  const visibleSlots = slots.filter((slot) => slotPeriod(slot) === period);
  const availableCount = visibleSlots.filter((slot) => slot.available).length;
  const otherPeriod = periods.find(
    (item) =>
      item !== period &&
      slots.some((slot) => slotPeriod(slot) === item && slot.available),
  );

  function prepareSearch() {
    setLoadingTimes(true);
    setAvailabilityError("");
    setPaused(false);
    setSlots([]);
    setSelectedStart(null);
    setPolicyAccepted(false);
  }

  function chooseDate(nextDate: string) {
    if (!nextDate || nextDate === date) return;
    prepareSearch();
    setBookingError("");
    setDate(nextDate);
  }

  function resetSearch() {
    prepareSearch();
    setStep("search");
    setBookingError("");
    setUncertainResult(false);
    setRefresh((value) => value + 1);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedStart ||
      !policyAccepted ||
      requestInFlight.current ||
      uncertainResult
    )
      return;
    requestInFlight.current = true;
    setSubmitting(true);
    setBookingError("");
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: details.name,
          phone: details.phone,
          email: details.email,
          request: details.request,
          partySize,
          startsAt: selectedStart.toISOString(),
          policyAccepted,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reservation?: { confirmationCode: string };
      };
      if (!response.ok || !payload.reservation?.confirmationCode) {
        setBookingError(
          payload.error ??
            "We couldn’t complete this booking. Please try again or call us.",
        );
        if (response.status === 409) {
          prepareSearch();
          setStep("search");
          setRefresh((value) => value + 1);
        }
        return;
      }
      setConfirmation(payload.reservation.confirmationCode);
      setStep("confirmed");
    } catch {
      // The request might have reached the server: do not blindly submit twice.
      setUncertainResult(true);
      setBookingError(
        "We couldn’t confirm whether your reservation was saved. Please call (416) 535-2242 before submitting again.",
      );
    } finally {
      requestInFlight.current = false;
      setSubmitting(false);
    }
  }

  function updateDetails(field: keyof GuestDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  return (
    <section
      className={`booking-card reservation-card ${step === "confirmed" ? "reservation-confirmed" : ""}`}
      aria-labelledby="booking-title"
    >
      <BookingSteps current={step} />
      {step === "confirmed" && selectedStart ? (
        <>
          <div className="reservation-success-mark">
            <Check size={32} aria-hidden="true" />
          </div>
          <p className="reservation-eyebrow">IT’S OFFICIAL. COME HUNGRY.</p>
          <h2 id="booking-title" ref={title} tabIndex={-1}>
            You’re on the list.
          </h2>
          <p className="reservation-card-copy">
            Your table is confirmed. Save the code below for changes or
            cancellation.
          </p>
          <div className="reservation-code">
            <span>YOUR CONFIRMATION CODE</span>
            <strong>{confirmation}</strong>
          </div>
          <div className="confirmation-details">
            <span>
              <CalendarDays size={18} aria-hidden="true" />
              {formatToronto(selectedStart, "EEEE, MMMM d")}
            </span>
            <span>
              <Clock3 size={18} aria-hidden="true" />
              {formatToronto(selectedStart, "h:mm a")} · Toronto time
            </span>
            <span>
              <Users size={18} aria-hidden="true" />
              {partySize} {partySize === 1 ? "guest" : "guests"} · Two-hour
              table
            </span>
            <span>
              <MapPin size={18} aria-hidden="true" />
              1242 Dundas Street West
            </span>
          </div>
          <div className="reservation-info-note">
            We hold your reservation for 15 minutes. Plans changed? Manage your
            booking at least 24 hours ahead, or call us inside 24 hours.
          </div>
          <Link
            className="button button-pink"
            href={`/manage?code=${encodeURIComponent(confirmation)}`}
          >
            Manage your booking <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a
            className="reservation-secondary-link"
            href={restaurantLinks.menuUrl}
          >
            Work up an appetite. See the menu ↗
          </a>
          <button
            className="reservation-secondary-link"
            onClick={() => {
              setDetails({ name: "", phone: "", email: "", request: "" });
              resetSearch();
            }}
          >
            Make another booking
          </button>
        </>
      ) : step === "details" && selectedStart ? (
        <>
          <button
            className="back-button"
            onClick={resetSearch}
            disabled={submitting}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Change date or time
          </button>
          <p className="reservation-eyebrow">02 / A NAME FOR THE TABLE</p>
          <h2 id="booking-title" ref={title} tabIndex={-1}>
            Who’s coming over?
          </h2>
          <p className="reservation-card-copy">
            One last thing before the good stuff.
          </p>
          <div className="booking-summary">
            <strong>
              <CalendarDays size={17} aria-hidden="true" />
              {formatToronto(selectedStart, "EEE, MMM d · h:mm a")}
            </strong>
            <span>
              {partySize} {partySize === 1 ? "guest" : "guests"} · Two-hour
              table · Toronto time
            </span>
          </div>
          <form onSubmit={submitBooking} aria-busy={submitting}>
            <fieldset
              disabled={submitting}
              className="reservation-details-fields"
            >
              <legend className="reservation-visually-hidden">
                Your contact details
              </legend>
              <div className="field-grid">
                <label htmlFor="guest-name">
                  Your name
                  <input
                    id="guest-name"
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    value={details.name}
                    onChange={(event) =>
                      updateDetails("name", event.target.value)
                    }
                    required
                    placeholder="First and last name"
                  />
                </label>
                <label htmlFor="guest-phone">
                  Mobile number
                  <input
                    id="guest-phone"
                    name="phone"
                    autoComplete="tel"
                    required
                    type="tel"
                    minLength={7}
                    maxLength={30}
                    value={details.phone}
                    onChange={(event) =>
                      updateDetails("phone", event.target.value)
                    }
                    placeholder="(416) 555-0123"
                  />
                </label>
              </div>
              <label htmlFor="guest-email">
                Email address
                <input
                  id="guest-email"
                  name="email"
                  autoComplete="email"
                  required
                  type="email"
                  maxLength={200}
                  value={details.email}
                  onChange={(event) =>
                    updateDetails("email", event.target.value)
                  }
                  placeholder="you@example.com"
                />
              </label>
              <label htmlFor="guest-request">
                Anything we should know?{" "}
                <span className="optional">Optional</span>
                <textarea
                  id="guest-request"
                  name="request"
                  maxLength={1000}
                  rows={2}
                  value={details.request}
                  onChange={(event) =>
                    updateDetails("request", event.target.value)
                  }
                  placeholder="Allergies, accessibility, a reason to celebrate…"
                />
                <span className="reservation-field-help">
                  Requests are welcome; seating preferences aren’t guaranteed.
                </span>
              </label>
              <details className="policy-box">
                <summary>Our reservation policies</summary>
                <ul>
                  {RESERVATION_POLICIES.map((policy) => (
                    <li key={policy}>{policy}</li>
                  ))}
                </ul>
              </details>
              <p className="reservation-policy-summary">
                Two-hour tables · 15-minute arrival grace · Changes 24 hours
                ahead. Parties of six: one bill and 18% auto-gratuity. Patio
                seating is walk-in only.
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={policyAccepted}
                  required
                  onChange={(event) => setPolicyAccepted(event.target.checked)}
                />
                <span>I have read and agree to the reservation policies.</span>
              </label>
            </fieldset>
            {bookingError && (
              <p className="form-error" role="alert">
                {bookingError}
              </p>
            )}
            {uncertainResult ? (
              <a className="button button-pink" href="tel:+14165352242">
                <Phone size={17} aria-hidden="true" />
                Call to check your booking
              </a>
            ) : (
              <button
                className="button button-pink"
                disabled={!policyAccepted || submitting}
              >
                {submitting ? (
                  <>
                    <LoaderCircle
                      className="reservation-spinner"
                      size={17}
                      aria-hidden="true"
                    />
                    Confirming your table…
                  </>
                ) : (
                  <>
                    Confirm reservation{" "}
                    <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>
            )}
          </form>
        </>
      ) : (
        <>
          <p className="reservation-eyebrow">01 / SAVE YOUR SEAT</p>
          <h2 id="booking-title" ref={title} tabIndex={-1}>
            Find your table.
          </h2>
          <p className="reservation-card-copy">
            Pick your people. Pick your time. We’ll bring the rest.
          </p>
          <fieldset className="reservation-party">
            <legend>
              <Users size={16} aria-hidden="true" />
              How many guests?
            </legend>
            <div className="party-grid">
              {partySizes.map((size) => (
                <button
                  className={partySize === size ? "choice active" : "choice"}
                  key={size}
                  aria-label={`${size} ${size === 1 ? "guest" : "guests"}`}
                  aria-pressed={partySize === size}
                  onClick={() => {
                    if (size === partySize) return;
                    prepareSearch();
                    setBookingError("");
                    setPartySize(size);
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="field-note">
              Seven or more?{" "}
              <a href="mailto:reservations@lachingada.ca">
                Let’s talk about your group ↗
              </a>
            </p>
          </fieldset>
          <div className="reservation-date">
            <label htmlFor="reservation-date">
              <CalendarDays size={16} aria-hidden="true" />
              Which day?
            </label>
            <div className="reservation-date-controls">
              <input
                id="reservation-date"
                type="date"
                value={date}
                min={initialToday}
                max={finalDate}
                onChange={(event) => chooseDate(event.target.value)}
              />
              <div className="reservation-quick-dates">
                <button
                  aria-pressed={date === initialToday}
                  onClick={() => chooseDate(initialToday)}
                >
                  Today
                </button>
                <button
                  aria-pressed={date === initialDate}
                  onClick={() => chooseDate(initialDate)}
                >
                  Tomorrow
                </button>
              </div>
            </div>
          </div>
          <div className="reservation-times" aria-busy={loadingTimes}>
            <div className="reservation-times-heading">
              <h3>
                <Clock3 size={16} aria-hidden="true" />
                Choose your time
              </h3>
              <span>TORONTO TIME</span>
            </div>
            {!loadingTimes && !availabilityError && periods.length > 1 && (
              <div className="period-tabs" aria-label="Time of day">
                {periods.map((item) => (
                  <button
                    className={period === item ? "active" : ""}
                    key={item}
                    aria-pressed={period === item}
                    onClick={() => setPeriod(item)}
                  >
                    {item === "Earlier" ? "Before 6 PM" : "6 PM & later"}
                  </button>
                ))}
              </div>
            )}
            {loadingTimes ? (
              <div className="reservation-times-loading" role="status">
                <LoaderCircle
                  className="reservation-spinner"
                  size={19}
                  aria-hidden="true"
                />
                <span>Checking the tables…</span>
                <div aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </div>
            ) : availabilityError ? (
              <div className="reservation-state-message">
                <p className="form-error" role="alert">
                  {availabilityError}
                </p>
                <button
                  className="reservation-retry"
                  onClick={() => {
                    prepareSearch();
                    setRefresh((value) => value + 1);
                  }}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Try availability again
                </button>
                <a href="tel:+14165352242">Or call (416) 535-2242 ↗</a>
              </div>
            ) : paused ? (
              <div className="reservation-state-message" role="status">
                <strong>Online bookings are paused for this date.</strong>
                <p>
                  Try another day or call the restaurant. We’ll see what we can
                  do.
                </p>
              </div>
            ) : (
              <>
                <p className="reservation-availability-count" role="status">
                  {availableCount
                    ? `${availableCount} ${availableCount === 1 ? "time" : "times"} available · select one to continue`
                    : "No tables in this time window."}
                </p>
                <div className="time-grid">
                  {visibleSlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      className="time-choice"
                      disabled={!slot.available}
                      aria-label={`${slot.label}${slot.available ? " — select this time" : " — unavailable"}`}
                      onClick={() => {
                        setSelectedStart(new Date(slot.startsAt));
                        setBookingError("");
                        setUncertainResult(false);
                        setStep("details");
                      }}
                    >
                      {slot.label}
                      {!slot.available && <small>Unavailable</small>}
                    </button>
                  ))}
                </div>
                {!availableCount && (
                  <div className="reservation-empty">
                    <strong>A different time, same good tacos.</strong>
                    <p>
                      {otherPeriod
                        ? "There are tables in the other time window."
                        : "Try another date, or give us a call."}
                    </p>
                    {otherPeriod && (
                      <button
                        className="reservation-retry"
                        onClick={() => setPeriod(otherPeriod)}
                      >
                        See {otherPeriod === "Earlier" ? "earlier" : "later"}{" "}
                        times <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {bookingError && (
            <p className="form-error" role="alert">
              {bookingError}
            </p>
          )}
          <div className="reservation-service-note">
            <Phone size={18} aria-hidden="true" />
            <p>
              <strong>Need a hand?</strong>For same-day bookings or changes,{" "}
              <a href="tel:+14165352242">call (416) 535-2242</a>. Our patio is
              first come, first sat.
            </p>
          </div>
          <p className="reservation-manage-prompt">
            Already booked?{" "}
            <Link href="/manage">Manage your reservation ↗</Link>
          </p>
        </>
      )}
    </section>
  );
}
