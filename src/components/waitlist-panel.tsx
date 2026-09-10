"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { RESTAURANT_TIMEZONE, reservationTableIds, type StoredWaitlistEntry } from "@/lib/restaurant";
import { reservationConflictsWithTurn } from "@/lib/live-service";
import type { RestaurantState } from "@/lib/state";
import { OFFER_MS, TURN_MS, type WaitlistStaffAction, type WaitlistDelivery } from "@/lib/waitlist-types";
import styles from "./waitlist.module.css";

export type WaitlistAction = WaitlistStaffAction;
export type { WaitlistDelivery } from "@/lib/waitlist-types";

function timerLabel(deadline: string | undefined, now: Date) {
  if (!deadline) return "";
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - now.getTime()) / 1000));
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "EXPIRING";
}

export function WaitlistPanel({ state, onAction }: {
  state: RestaurantState;
  onAction: (entryId: string, action: WaitlistAction, tableId?: string) => Promise<WaitlistDelivery[] | undefined>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = formatInTimeZone(now, RESTAURANT_TIMEZONE, "yyyy-MM-dd");
  const entries = state.waitlist.filter((entry) => formatInTimeZone(new Date(entry.joinedAt), RESTAURANT_TIMEZONE, "yyyy-MM-dd") === today)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const waiting = entries.filter((entry) => entry.status === "waiting");
  const pending = entries.filter((entry) => ["offered", "accepted"].includes(entry.status));
  const history = entries.filter((entry) => !["waiting", "offered", "accepted"].includes(entry.status));

  async function act(entry: StoredWaitlistEntry, action: WaitlistAction) {
    if (busy) return;
    if (action === "remove" && !window.confirm(`Remove ${entry.guestName} and release any held table?`)) return;
    if (action === "offer" && !window.confirm(`Offer the selected table to ${entry.guestName}? Their five-minute response timer starts now.`)) return;
    setBusy(entry.id);
    setFeedback(null);
    try {
      const delivery = await onAction(entry.id, action, selection[entry.id]);
      setNow(new Date());
      const failed = delivery?.filter((result) => !result.sent) ?? [];
      const sent = delivery?.filter((result) => result.sent) ?? [];
      const updated = action === "offer" ? "Table held. Five-minute offer is live on the guest's ticket."
        : action === "up_next" ? "Up-next message is live on the guest's ticket."
        : action === "seat" ? "Party seated. Their table is now occupied."
        : action === "requeue" ? "Party returned to the end of the queue."
        : "Party removed and their table released.";
      setFeedback({
        error: failed.length > 0,
        message: `${updated}${sent.length ? ` ${sent.map((item) => item.channel.toUpperCase()).join(", ")} accepted the notification for delivery.` : ""}${failed.length ? ` ${failed.map((item) => item.error ?? `${item.channel} delivery failed`).join(" ")} The guest must keep their ticket open or be contacted directly.` : ""}`,
      });
    } catch (cause) {
      setFeedback({ error: true, message: cause instanceof Error ? cause.message : "Could not update this party. Please retry." });
    } finally {
      setBusy(null);
    }
  }

  function row(entry: StoredWaitlistEntry, index?: number) {
    const endsAt = new Date(now.getTime() + OFFER_MS + TURN_MS);
    const available = state.tables.filter((table) =>
      table.capacity >= entry.partySize &&
      !state.operations.blockedTableIds.includes(table.id) &&
      !state.reservations.some((reservation) => reservationTableIds(reservation).includes(table.id) && reservationConflictsWithTurn(reservation, now, endsAt)) &&
      !state.operations.tableHolds.some((hold) => hold.tableId === table.id && new Date(hold.startsAt) < endsAt && new Date(hold.endsAt) > now),
    ).sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const selectedIsAvailable = available.some((table) => table.id === selection[entry.id]);
    return (
      <article className={styles.queueRow} key={entry.id}>
        <div className={styles.queueNumber}>{index === undefined ? "!" : index + 1}</div>
        <div className={styles.queueGuest}>
          <strong>{entry.guestName}</strong>
          <span>{entry.partySize} guests · joined {formatInTimeZone(new Date(entry.joinedAt), RESTAURANT_TIMEZONE, "h:mm a")}</span>
          <a href={`tel:${entry.phone}`}>{entry.phone || "No phone recorded"}</a>
          {entry.notes && <p><strong>NOTE:</strong> {entry.notes}</p>}
          <span>{entry.pushEnabled ? "Push alerts enabled" : "Live ticket only · no push enabled"}</span>
          <span className={styles.queueBadge}>{entry.status === "waiting" ? entry.upNextAt ? "UP NEXT SENT" : `${Math.max(0, Math.floor((now.getTime() - new Date(entry.joinedAt).getTime()) / 60_000))} MIN WAITING` : entry.status === "accepted" ? "ACCEPTED · ON THEIR WAY" : "AWAITING YES / NO"}</span>
          {entry.status === "offered" && <span className={styles.queueTimer}>{timerLabel(entry.offerExpiresAt, now)} TO REPLY</span>}
          {entry.status === "accepted" && <span className={styles.queueTimer}>{timerLabel(entry.arrivalDeadline, now)} TO ARRIVE</span>}
          {entry.offerTableId && <span>TABLE {state.tables.find((table) => table.id === entry.offerTableId)?.name ?? entry.offerTableId}</span>}
        </div>
        <div className={styles.queueActions}>
          {entry.status === "waiting" && (
            <>
              <button className={styles.secondary} disabled={!!busy || !!entry.upNextAt} onClick={() => void act(entry, "up_next")}>{entry.upNextAt ? "UP NEXT SENT" : "TELL THEM: UP NEXT"}</button>
              <select aria-label={`Table for ${entry.guestName}`} value={selectedIsAvailable ? selection[entry.id] : ""} disabled={!!busy} onChange={(event) => setSelection({ ...selection, [entry.id]: event.target.value })}>
                <option value="">{available.length ? "Choose a free table..." : "No suitable table free for a full turn"}</option>
                {available.map((table) => <option value={table.id} key={table.id}>T{table.name} · {table.capacity} seats · {table.floor}</option>)}
              </select>
              <button className={styles.primary} disabled={!!busy || !selectedIsAvailable} onClick={() => void act(entry, "offer")}>{busy === entry.id ? "SAVING..." : "OFFER TABLE · 5 MIN"}</button>
            </>
          )}
          {entry.status === "accepted" && <button className={styles.primary} disabled={!!busy} onClick={() => void act(entry, "seat")}>{busy === entry.id ? "SEATING..." : "SEAT PARTY NOW"}</button>}
          <button className={styles.remove} disabled={!!busy} onClick={() => void act(entry, "remove")}>REMOVE</button>
        </div>
      </article>
    );
  }

  return (
    <section className="admin-panel">
      <div className={styles.staffHeader}>
        <div><h2>DOOR WAITLIST</h2><p>{waiting.length} waiting · {pending.length} offered / on their way · Today only</p></div>
        <div className={styles.staffLinks}><Link href="/waitlist/sign" target="_blank">PRINT QR SIGN</Link><Link href="/waitlist" target="_blank">GUEST VIEW</Link></div>
      </div>
      <p className={styles.finePrint}>Up next is a heads-up, not a table hold. Offer a free table to start the five-minute yes/no timer. No reply releases it automatically. Accepted parties have 15 minutes to arrive.</p>
      {feedback && <div className={feedback.error ? styles.error : styles.notice} role="status">{feedback.message}</div>}
      {pending.length > 0 && <section className={styles.queueGroup}><h3>TABLE OFFERS & EXPECTED ARRIVALS</h3>{pending.map((entry) => row(entry))}</section>}
      <section className={styles.queueGroup}><h3>WAITING FOR A TABLE</h3>{waiting.map((entry, index) => row(entry, index))}{!waiting.length && <p className={styles.empty}>The queue is clear. Guests can scan the QR sign to join.</p>}</section>
      {history.length > 0 && <details className={styles.history}><summary>FINISHED / REMOVED TODAY ({history.length})</summary>{history.map((entry) => <article className={styles.queueRow} key={entry.id}><div className={styles.queueGuest}><strong>{entry.guestName}</strong><span>{entry.partySize} guests · {entry.status}</span></div>{entry.status !== "seated" && <div className={styles.queueActions}><button disabled={!!busy} onClick={() => void act(entry, "requeue")}>REJOIN AT END</button></div>}</article>)}</details>}
    </section>
  );
}
