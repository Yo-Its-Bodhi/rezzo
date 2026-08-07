"use client";

import { Check, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { readStoredWaitlist, StoredWaitlistEntry, writeStoredWaitlist } from "@/lib/restaurant";

export function WaitlistForm() {
  const [partySize, setPartySize] = useState(2);
  const [joined, setJoined] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entry: StoredWaitlistEntry = {
      id: crypto.randomUUID(),
      guestName: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email")),
      notes: String(form.get("notes") ?? ""),
      partySize,
      joinedAt: new Date().toISOString(),
      status: "waiting",
    };
    writeStoredWaitlist([...readStoredWaitlist(), entry]);
    setJoined(true);
  }

  if (joined) {
    return (
      <section className="booking-card confirmation-card">
        <div className="confirmation-mark"><Check size={42} strokeWidth={4} /></div>
        <p className="eyebrow">YOU&apos;RE ON IT</p>
        <h2>DON&apos;T GO FAR.</h2>
        <p className="muted">
          We&apos;ll text and email when a matching table opens. You&apos;ll have five minutes
          to accept. Joining the list does not guarantee a table.
        </p>
        <Link className="button button-dark" href="/">BACK TO RESERVATIONS</Link>
      </section>
    );
  }

  return (
    <section className="booking-card">
      <p className="step-label">TODAY&apos;S WALK-IN LIST</p>
      <h2>WHO&apos;S WAITING?</h2>
      <form onSubmit={submit}>
        <span className="input-label"><Users size={16} /> PARTY SIZE</span>
        <div className="party-grid">
          {[1,2,3,4,5,6].map((size) => (
            <button type="button" className={partySize === size ? "choice active" : "choice"} key={size} onClick={() => setPartySize(size)}>{size}</button>
          ))}
        </div>
        <label>YOUR NAME<input name="name" required autoComplete="name" /></label>
        <div className="field-grid">
          <label>MOBILE<input name="phone" required type="tel" autoComplete="tel" /></label>
          <label>EMAIL<input name="email" required type="email" autoComplete="email" /></label>
        </div>
        <label>NOTES <span className="optional">(OPTIONAL)</span><textarea name="notes" rows={2} /></label>
        <p className="waitlist-disclaimer">
          By joining, you agree to receive transactional SMS and email about this wait.
          This is not a guaranteed reservation.
        </p>
        <button className="button button-pink">JOIN THE WAITLIST →</button>
      </form>
    </section>
  );
}
