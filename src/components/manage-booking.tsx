"use client";

import { differenceInHours } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Pencil,
  Phone,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { RESTAURANT_TIMEZONE, type StoredReservation } from "@/lib/restaurant";

type BookingResponse = { reservation?: StoredReservation; error?: string };

export function ManageBooking() {
  const [reservation, setReservation] = useState<StoredReservation | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState({ code: "", contact: "" });
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<"find" | "edit" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestInFlight = useRef(false);
  const resultTitle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setCode(new URLSearchParams(window.location.search).get("code") ?? ""),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  async function requestBooking(
    action: "find" | "edit" | "cancel",
    body: object,
  ) {
    if (requestInFlight.current) return null;
    requestInFlight.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/reservations/manage", {
        method: action === "find" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok || !payload.reservation)
        throw new Error(
          payload.error ??
            "We couldn’t load your reservation. Please try again.",
        );
      setReservation(payload.reservation);
      setEditing(false);
      setConfirmCancel(false);
      if (action !== "find")
        setNotice(
          action === "cancel"
            ? "Your reservation is cancelled."
            : "Your changes are saved.",
        );
      window.requestAnimationFrame(() => resultTitle.current?.focus());
      return payload.reservation;
    } catch (failure) {
      setError(
        failure instanceof TypeError || failure instanceof SyntaxError
          ? action === "find"
            ? "We couldn’t reach the booking system. Please try again or call us."
            : "We couldn’t confirm the result. Please look up your booking again or call (416) 535-2242 before trying the change again."
          : failure instanceof Error
            ? failure.message
            : "We couldn’t complete that request. Please call us.",
      );
      return null;
    } finally {
      requestInFlight.current = false;
      setBusy(null);
    }
  }

  async function findBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextLookup = {
      code: String(form.get("code")).trim().toUpperCase(),
      contact: String(form.get("contact")).trim(),
    };
    setLookup(nextLookup);
    await requestBooking("find", nextLookup);
  }

  async function editBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation) return;
    const form = new FormData(event.currentTarget);
    const startsAt = fromZonedTime(
      String(form.get("startsAt")),
      RESTAURANT_TIMEZONE,
    );
    if (!Number.isFinite(startsAt.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    await requestBooking("edit", {
      ...lookup,
      action: "edit",
      partySize: Number(form.get("partySize")),
      startsAt: startsAt.toISOString(),
      request: String(form.get("request") ?? ""),
    });
  }

  const outsideCutoff =
    reservation &&
    differenceInHours(new Date(reservation.startsAt), new Date()) >= 24;

  return (
    <section
      className="booking-card manage-card"
      aria-labelledby="manage-title"
      aria-busy={Boolean(busy)}
    >
      <p className="step-label">MANAGE YOUR RESERVATION</p>
      <h2 id="manage-title">Plans changed?</h2>
      {!reservation ? (
        <>
          <p className="reservation-manage-empty">
            Your confirmation code and the email or phone number used to book
            are all you need.
          </p>
          <form onSubmit={findBooking}>
            <fieldset
              className="reservation-details-fields"
              disabled={Boolean(busy)}
            >
              <legend className="reservation-visually-hidden">
                Find your reservation
              </legend>
              <label htmlFor="booking-code">
                Confirmation code
                <input
                  id="booking-code"
                  name="code"
                  required
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={100}
                  placeholder="LC-ABC123"
                />
              </label>
              <label htmlFor="booking-contact">
                Booking email or phone
                <input
                  id="booking-contact"
                  name="contact"
                  required
                  maxLength={200}
                  placeholder="The email or phone you booked with"
                  autoComplete="off"
                />
              </label>
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button-pink" disabled={Boolean(busy)}>
              {busy === "find" ? (
                <LoaderCircle
                  size={17}
                  className="reservation-spinner"
                  aria-hidden="true"
                />
              ) : (
                <Search size={17} aria-hidden="true" />
              )}
              {busy === "find"
                ? "Finding your booking…"
                : "Find my reservation"}
            </button>
          </form>
          <Link className="reservation-secondary-link" href="/">
            Need a table instead? Book here ↗
          </Link>
        </>
      ) : (
        <>
          <div className="manage-name" ref={resultTitle} tabIndex={-1}>
            {reservation.guestName}
          </div>
          <div className="confirmation-details">
            <span>
              <CalendarDays size={18} aria-hidden="true" />
              {formatInTimeZone(
                new Date(reservation.startsAt),
                RESTAURANT_TIMEZONE,
                "EEEE, MMMM d",
              )}
            </span>
            <span>
              <Clock3 size={18} aria-hidden="true" />
              {formatInTimeZone(
                new Date(reservation.startsAt),
                RESTAURANT_TIMEZONE,
                "h:mm a",
              )}{" "}
              · Toronto time
            </span>
            <span>
              <Users size={18} aria-hidden="true" />
              {reservation.partySize}{" "}
              {reservation.partySize === 1 ? "guest" : "guests"} · Two-hour
              table
            </span>
          </div>
          <span className="status-badge">
            {reservation.status.replaceAll("_", " ")}
          </span>
          {notice && (
            <p className="reservation-manage-status" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {editing && reservation.status === "confirmed" && outsideCutoff && (
            <form className="manage-edit-form" onSubmit={editBooking}>
              <fieldset
                className="reservation-details-fields"
                disabled={Boolean(busy)}
              >
                <legend className="reservation-visually-hidden">
                  Change your reservation
                </legend>
                <div className="field-grid">
                  <label htmlFor="edit-time">
                    New date & time
                    <input
                      id="edit-time"
                      name="startsAt"
                      type="datetime-local"
                      step="900"
                      defaultValue={formatInTimeZone(
                        new Date(reservation.startsAt),
                        RESTAURANT_TIMEZONE,
                        "yyyy-MM-dd'T'HH:mm",
                      )}
                      required
                    />
                    <span className="reservation-field-help">
                      Choose Toronto local time.
                    </span>
                  </label>
                  <label htmlFor="edit-party">
                    Number of guests
                    <input
                      id="edit-party"
                      name="partySize"
                      type="number"
                      min="1"
                      max="6"
                      defaultValue={reservation.partySize}
                      required
                    />
                  </label>
                </div>
                <label htmlFor="edit-request">
                  Anything we should know?
                  <textarea
                    id="edit-request"
                    name="request"
                    maxLength={1000}
                    rows={3}
                    defaultValue={reservation.request ?? ""}
                  />
                </label>
              </fieldset>
              <p className="manage-rule-note">
                Your new time is subject to availability. We’ll keep your
                original reservation if the change can’t be made.
              </p>
              <div className="manage-actions">
                <button className="button button-pink" disabled={Boolean(busy)}>
                  {busy === "edit" ? (
                    <LoaderCircle
                      size={17}
                      className="reservation-spinner"
                      aria-hidden="true"
                    />
                  ) : null}
                  {busy === "edit" ? "Saving changes…" : "Save changes"}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setEditing(false)}
                >
                  Keep original
                </button>
              </div>
            </form>
          )}
          {reservation.status === "confirmed" &&
            outsideCutoff &&
            !editing &&
            !confirmCancel && (
              <div className="manage-actions">
                <button
                  className="button button-pink"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setEditing(true);
                    setError("");
                    setNotice("");
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Change booking
                </button>
                <button
                  className="button danger-button"
                  disabled={Boolean(busy)}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel booking
                </button>
              </div>
            )}
          {confirmCancel && (
            <div className="reservation-cancel-prompt">
              <p>
                <strong>Cancel this reservation?</strong>
                <br />
                Your table will be released. You’ll need a new booking if you
                change your mind.
              </p>
              <div className="manage-actions">
                <button
                  className="button danger-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void requestBooking("cancel", {
                      ...lookup,
                      action: "cancel",
                    })
                  }
                >
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel my table"}
                </button>
                <button
                  className="button button-outline"
                  disabled={Boolean(busy)}
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep my booking
                </button>
              </div>
            </div>
          )}
          {reservation.status === "confirmed" && !outsideCutoff && (
            <div className="alert-banner guest-alert">
              Your reservation is within 24 hours. For changes, please{" "}
              <a href="tel:+14165352242">call (416) 535-2242</a>.
            </div>
          )}
          {reservation.status === "cancelled" && (
            <p className="cancelled-note">
              Your table has been released. We’ll keep the tacos warm for
              another time.
            </p>
          )}
          <button
            className="reservation-secondary-link"
            disabled={Boolean(busy)}
            onClick={() => {
              setReservation(null);
              setEditing(false);
              setConfirmCancel(false);
              setError("");
              setNotice("");
            }}
          >
            Look up another booking
          </button>
          <Link className="reservation-secondary-link" href="/">
            Book a new table <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </>
      )}
      <div className="reservation-service-note">
        <Phone size={18} aria-hidden="true" />
        <p>
          <strong>Rather talk to a human?</strong>
          <a href="tel:+14165352242">(416) 535-2242</a>. Please call for
          same-day changes.
        </p>
      </div>
    </section>
  );
}
