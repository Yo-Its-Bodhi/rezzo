"use client";

import { differenceInHours, format } from "date-fns";
import { CalendarDays, Clock3, Search, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  readStoredReservations,
  StoredReservation,
  writeStoredReservations,
} from "@/lib/restaurant";

export function ManageBooking() {
  const [reservation, setReservation] = useState<StoredReservation | null>(null);
  const [searched, setSearched] = useState(false);
  const [initialCode, setInitialCode] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInitialCode(new URLSearchParams(window.location.search).get("code") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function findBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).trim().toUpperCase();
    const email = String(form.get("email")).trim().toLowerCase();
    const match = readStoredReservations().find(
      (item) =>
        item.confirmationCode.toUpperCase() === code &&
        item.email.toLowerCase() === email,
    );
    setReservation(match ?? null);
    setSearched(true);
  }

  function cancelBooking() {
    if (!reservation) return;
    const next = readStoredReservations().map((item) =>
      item.id === reservation.id ? { ...item, status: "cancelled" as const } : item,
    );
    writeStoredReservations(next);
    setReservation({ ...reservation, status: "cancelled" });
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
            BOOKING EMAIL
            <input name="email" required type="email" placeholder="hola@example.com" />
          </label>
          {searched && <p className="form-error">We couldn&apos;t match those booking details.</p>}
          <button className="button button-pink"><Search size={17} /> FIND MY BOOKING</button>
        </form>
      )}
      {reservation && (
        <>
          <div className="manage-name">{reservation.guestName}</div>
          <div className="confirmation-details">
            <span><CalendarDays size={18} /> {format(new Date(reservation.startsAt), "EEEE, MMMM d")}</span>
            <span><Clock3 size={18} /> {format(new Date(reservation.startsAt), "h:mm a")}</span>
            <span><Users size={18} /> Party of {reservation.partySize}</span>
          </div>
          <span className="status-badge">{reservation.status}</span>
          {reservation.status === "confirmed" && outsideCutoff && (
            <button className="button danger-button" onClick={cancelBooking}>CANCEL RESERVATION</button>
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
