"use client";

import { differenceInHours } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CalendarDays, Clock3, Pencil, Search, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { RESTAURANT_TIMEZONE, StoredReservation } from "@/lib/restaurant";

export function ManageBooking() {
  const [reservation, setReservation] = useState<StoredReservation | null>(null);
  const [searched, setSearched] = useState(false);
  const [initialCode, setInitialCode] = useState("");
  const [lookup, setLookup] = useState({ code: "", contact: "" });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInitialCode(new URLSearchParams(window.location.search).get("code") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function findBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).trim().toUpperCase();
    const contact = String(form.get("contact")).trim();
    const response = await fetch("/api/reservations/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, contact }),
    });
    const payload = (await response.json()) as { reservation?: StoredReservation; error?: string };
    setReservation(payload.reservation ?? null);
    setLookup({ code, contact });
    setError(response.ok ? "" : payload.error ?? "The booking could not be loaded.");
    setSearched(true);
  }

  async function cancelBooking() {
    if (!reservation) return;
    const response = await fetch("/api/reservations/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lookup, action: "cancel" }),
    });
    const payload = (await response.json()) as { reservation?: StoredReservation; error?: string };
    if (!response.ok || !payload.reservation) {
      setError(payload.error ?? "The booking could not be cancelled.");
      return;
    }
    setReservation(payload.reservation);
    setEditing(false);
  }

  async function editBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation) return;
    const form = new FormData(event.currentTarget);
    const startsAt = fromZonedTime(String(form.get("startsAt")), RESTAURANT_TIMEZONE);
    setError("");
    const response = await fetch("/api/reservations/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lookup,
        action: "edit",
        partySize: Number(form.get("partySize")),
        startsAt: startsAt.toISOString(),
        request: String(form.get("request") ?? ""),
      }),
    });
    const payload = (await response.json()) as { reservation?: StoredReservation; error?: string };
    if (!response.ok || !payload.reservation) {
      setError(payload.error ?? "The booking could not be changed.");
      return;
    }
    setReservation(payload.reservation);
    setEditing(false);
  }

  const outsideCutoff =
    reservation &&
    differenceInHours(new Date(reservation.startsAt), new Date()) >= 24;

  return (
    <section className="booking-card manage-card">
      <p className="step-label">MANAGE YOUR TABLE</p>
      <h2>PLANS CHANGED?</h2>
      {!reservation && (
        <form onSubmit={findBooking}>
          <label>
            CONFIRMATION CODE
            <input name="code" required defaultValue={initialCode} placeholder="LC-ABC123" />
          </label>
          <label>
            BOOKING EMAIL OR PHONE
            <input name="contact" required placeholder="hola@example.com or 416-555-0100" />
          </label>
          {searched && error && <p className="form-error">{error}</p>}
          <button className="button button-pink"><Search size={17} /> FIND MY BOOKING</button>
        </form>
      )}
      {reservation && (
        <>
          <div className="manage-name">{reservation.guestName}</div>
          <div className="confirmation-details">
            <span><CalendarDays size={18} /> {formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "EEEE, MMMM d")}</span>
            <span><Clock3 size={18} /> {formatInTimeZone(new Date(reservation.startsAt), RESTAURANT_TIMEZONE, "h:mm a")}</span>
            <span><Users size={18} /> Party of {reservation.partySize}</span>
          </div>
          <span className="status-badge">{reservation.status}</span>
          {error && <p className="form-error">{error}</p>}
          {editing && reservation.status === "confirmed" && outsideCutoff && (
            <form className="manage-edit-form" onSubmit={editBooking}>
              <div className="field-grid">
                <label>
                  NEW DATE & TIME
                  <input
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
                </label>
                <label>
                  PARTY SIZE
                  <input name="partySize" type="number" min="1" max="6" defaultValue={reservation.partySize} required />
                </label>
              </div>
              <label>
                REQUESTS
                <textarea name="request" maxLength={1000} rows={3} defaultValue={reservation.request ?? ""} />
              </label>
              <p className="manage-rule-note">
                Changes are rechecked against table capacity, service hours, and the three-bookings-per-hour limit.
              </p>
              <div className="manage-actions">
                <button className="button button-pink">SAVE CHANGES</button>
                <button className="button button-outline" type="button" onClick={() => setEditing(false)}>KEEP ORIGINAL</button>
              </div>
            </form>
          )}
          {reservation.status === "confirmed" && outsideCutoff && (
            <div className="manage-actions">
              {!editing && (
                <button className="button button-pink" onClick={() => setEditing(true)}>
                  <Pencil size={17} /> EDIT RESERVATION
                </button>
              )}
              <button className="button danger-button" onClick={cancelBooking}>CANCEL RESERVATION</button>
            </div>
          )}
          {reservation.status === "confirmed" && !outsideCutoff && (
            <div className="alert-banner guest-alert">
              THIS BOOKING IS WITHIN 24 HOURS. PLEASE CALL THE RESTAURANT FOR CHANGES.
            </div>
          )}
          {reservation.status === "cancelled" && (
            <p className="cancelled-note">YOUR RESERVATION HAS BEEN CANCELLED.</p>
          )}
        </>
      )}
    </section>
  );
}
