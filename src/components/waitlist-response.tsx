"use client";

import { differenceInMilliseconds, formatDistanceToNowStrict } from "date-fns";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  readStoredWaitlist,
  StoredWaitlistEntry,
  writeStoredWaitlist,
} from "@/lib/restaurant";

export function WaitlistResponse({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<StoredWaitlistEntry | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEntry(readStoredWaitlist().find((item) => item.id === entryId) ?? null);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [entryId]);

  function respond(accepted: boolean) {
    if (!entry) return;
    const status: StoredWaitlistEntry["status"] = accepted ? "accepted" : "declined";
    const next = readStoredWaitlist().map((item) =>
      item.id === entry.id ? { ...item, status } : item,
    );
    writeStoredWaitlist(next);
    setEntry({ ...entry, status });
  }

  if (!loaded) return <section className="booking-card"><p>LOADING OFFER...</p></section>;
  if (!entry) {
    return <section className="booking-card"><h2>OFFER NOT FOUND.</h2><p>This link is invalid or no longer active.</p></section>;
  }

  const expired =
    !entry.offerExpiresAt ||
    differenceInMilliseconds(new Date(entry.offerExpiresAt), new Date()) <= 0;
  const canRespond = entry.status === "offered" && !expired;

  return (
    <section className="booking-card confirmation-card">
      <p className="eyebrow">YOUR TABLE IS READY</p>
      <h2>{entry.guestName}, YOU IN?</h2>
      {canRespond && (
        <>
          <p className="offer-countdown">
            {formatDistanceToNowStrict(new Date(entry.offerExpiresAt!), { addSuffix: true })}
          </p>
          <p className="muted">This offer is for your party of {entry.partySize}. Accept before it expires.</p>
          <div className="response-actions">
            <button className="button button-pink" onClick={() => respond(true)}><Check size={18} /> ACCEPT</button>
            <button className="button button-outline" onClick={() => respond(false)}><X size={18} /> DECLINE</button>
          </div>
        </>
      )}
      {(expired || entry.status === "expired") && <p className="cancelled-note">THIS OFFER HAS EXPIRED.</p>}
      {entry.status === "accepted" && <p className="accepted-note">YOU&apos;RE IN. PLEASE SEE THE HOST NOW.</p>}
      {entry.status === "declined" && <p className="cancelled-note">OFFER DECLINED. THANKS FOR LETTING US KNOW.</p>}
    </section>
  );
}
