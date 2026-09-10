"use client";

import { BellRing, Check, Clock3, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { RESTAURANT_TIMEZONE } from "@/lib/restaurant";
import type { WaitlistTicket } from "@/lib/waitlist-types";
import styles from "./waitlist.module.css";

const STORAGE_KEY = "rezzo-waitlist-ticket";
const terminalStatuses = new Set(["declined", "expired", "seated", "removed"]);

class TicketRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function ticketRequest(path: string, token: string, body?: object) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload: { ticket?: WaitlistTicket; token?: string; error?: string } = await response.json();
  if (!response.ok || !payload.ticket) {
    throw new TicketRequestError(payload.error ?? "We couldn't reach the waitlist. Please try again.", response.status);
  }
  return payload;
}

export function WaitlistGuest() {
  const [token, setToken] = useState("");
  const [ticket, setTicket] = useState<WaitlistTicket | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [unusableTicket, setUnusableTicket] = useState(false);
  const [now, setNow] = useState(Date.now);
  const serverOffset = useRef(0);
  const actionInFlight = useRef(false);
  const generation = useRef(0);

  const receiveTicket = useCallback((next: WaitlistTicket) => {
    serverOffset.current = new Date(next.serverNow).getTime() - Date.now();
    setNow(Date.now() + serverOffset.current);
    setTicket(next);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const configResponse = await fetch("/api/waitlist/config", { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Waitlist settings could not be loaded. Please refresh.");
        const config: { enabled: boolean; pushPublicKey: string | null } = await configResponse.json();
        if (!config.enabled) throw new Error("The online waitlist is currently closed. Please speak to our host.");
        const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token");
        let saved = fragment || "";
        if (!saved) {
          try {
            saved = localStorage.getItem(STORAGE_KEY) || "";
          } catch {
            if (active) setNotice("Browser storage is unavailable. Keep or bookmark your private ticket link after joining.");
          }
        }
        if (!active) return;
        if (saved) window.history.replaceState(null, "", `/waitlist#token=${encodeURIComponent(saved)}`);
        setPublicKey(config.pushPublicKey);
        setPushSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
        setToken(saved);
        setReady(true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to open the waitlist.");
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let fetching = false;
    async function poll() {
      if (fetching || actionInFlight.current) return;
      const version = generation.current;
      fetching = true;
      try {
        const payload = await ticketRequest("/api/waitlist", token);
        if (active && version === generation.current && payload.ticket) {
          receiveTicket(payload.ticket);
          setUnusableTicket(false);
          setError("");
        }
      } catch (cause) {
        if (active && version === generation.current) {
          setError(cause instanceof Error ? cause.message : "Connection lost. Keep this page open and retry.");
          setUnusableTicket(cause instanceof TicketRequestError && [401, 404].includes(cause.status));
        }
      } finally {
        fetching = false;
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    const refresh = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token, receiveTicket]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + serverOffset.current), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInFlight.current) return;
    const form = new FormData(event.currentTarget);
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: String(form.get("guestName")).trim(),
          phone: String(form.get("phone")).trim(),
          partySize: Number(form.get("partySize")),
          notes: String(form.get("notes") ?? "").trim(),
          consent: form.get("consent") === "on",
        }),
      });
      const payload: { token?: string; ticket?: WaitlistTicket; error?: string } = await response.json();
      if (!response.ok || !payload.token || !payload.ticket) {
        throw new Error(payload.error ?? "We couldn't add you. Please try again.");
      }
      window.history.replaceState(null, "", `/waitlist#token=${encodeURIComponent(payload.token)}`);
      setToken(payload.token);
      receiveTicket(payload.ticket);
      try {
        localStorage.setItem(STORAGE_KEY, payload.token);
      } catch {
        setNotice("Your browser cannot save your ticket. Bookmark this private page so you can return to it.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The waitlist could not be reached.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  async function respond(action: "accept" | "decline" | "leave") {
    if (!ticket || actionInFlight.current) return;
    if (action !== "accept" && !window.confirm("Give up your place and release any table being held for you?")) return;
    actionInFlight.current = true;
    generation.current += 1;
    setBusy(true);
    setError("");
    try {
      const payload = await ticketRequest("/api/waitlist/respond", token, { action, offerId: ticket.offerId });
      if (payload.ticket) receiveTicket(payload.ticket);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your reply could not be saved. Please try again.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  async function enablePush() {
    if (!publicKey || !pushSupported || actionInFlight.current) return;
    actionInFlight.current = true;
    generation.current += 1;
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications aren't allowed. Keep this page open, or enable notifications in your browser settings.");
      await navigator.serviceWorker.register("/waitlist-sw.js", { scope: "/waitlist" });
      const registration = await navigator.serviceWorker.ready;
      const key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const applicationServerKey = Uint8Array.from(atob(key), (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const payload = await ticketRequest("/api/waitlist/subscribe", token, { subscription: subscription.toJSON() });
      if (payload.ticket) receiveTicket(payload.ticket);
      setNotice("Notifications enabled. Keep this ticket handy; your five-minute timer starts when we offer a table.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be enabled. Keep this page open.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  function startAgain() {
    let storageNotice = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      storageNotice = "Browser storage is unavailable. Keep your new private ticket link after joining.";
    }
    window.history.replaceState(null, "", "/waitlist");
    generation.current += 1;
    setToken("");
    setTicket(null);
    setError("");
    setNotice(storageNotice);
    setUnusableTicket(false);
  }

  const remaining = ticket?.offerExpiresAt
    ? Math.max(0, Math.ceil((new Date(ticket.offerExpiresAt).getTime() - now) / 1000))
    : 0;
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const terminal = ticket && terminalStatuses.has(ticket.status);

  return (
    <main className={styles.guestShell}>
      <section className={styles.guestIntro}>
        <p className={styles.kicker}>LA CHINGADA / DUNDAS WEST</p>
        <h1>GOOD FOOD.<br /><em>WORTH THE WAIT.</em></h1>
        <p>Join the line without standing in it. Watch your place, stay nearby, and let us bring the good news.</p>
        <div className={styles.promise}><Clock3 size={22} /><span>YOUR TABLE OFFER.<br /><strong>5 MINUTES TO SAY YES.</strong></span></div>
      </section>
      <section className={styles.guestCard} aria-label="Your waitlist ticket">
        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {!ready && <p>{error ? "Please refresh to try again, or speak to our host." : "Opening the waitlist..."}</p>}
        {ready && !token && (
          <form onSubmit={join}>
            <p className={styles.kicker}>WALK IN. SCAN. RELAX.</p>
            <h2>GET ON THE LIST.</h2>
            <label>YOUR NAME<input name="guestName" autoComplete="name" maxLength={120} required placeholder="What should we call you?" /></label>
            <div className={styles.formGrid}>
              <label>MOBILE NUMBER<input name="phone" type="tel" autoComplete="tel" maxLength={30} minLength={7} required placeholder="(416) 555-0123" /></label>
              <label>PARTY SIZE<select name="partySize" defaultValue="2">{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}</select></label>
            </div>
            <label>ANYTHING WE SHOULD KNOW?<textarea name="notes" maxLength={500} rows={2} placeholder="Allergies, accessibility, little ones..." /></label>
            <label className={styles.consent}><input name="consent" type="checkbox" required /><span>I agree to the waitlist rules below and to receiving updates about this visit. No marketing.</span></label>
            <button className="button button-pink" disabled={busy}>{busy ? "ADDING YOU..." : "JOIN THE WAITLIST"} <Users size={18} /></button>
            <p className={styles.finePrint}>Your number helps our host identify your party. Updates appear on your ticket; enable push alerts after joining. If push is unavailable, a text backup may be sent.</p>
          </form>
        )}
        {ready && token && !ticket && <p>{unusableTicket ? "This ticket is no longer valid. You can clear it and join again, or speak to the host." : "Finding your place in line... Keep this private link. If it no longer works, speak to our host."}</p>}
        {unusableTicket && <button className="button button-outline" onClick={startAgain}>CLEAR INVALID TICKET</button>}
        {ticket && (
          <>
            <p className={styles.kicker}>{ticket.guestName} / PARTY OF {ticket.partySize}</p>
            {ticket.status === "waiting" && (
              <>
                <h2>{ticket.upNextAt ? "YOU'RE UP NEXT." : "YOU'RE ON THE LIST."}</h2>
                <div className={styles.position}><strong>#{ticket.position ?? "-"}</strong><span>{ticket.aheadCount === 0 ? "You're at the front of the queue." : `${ticket.aheadCount} ${ticket.aheadCount === 1 ? "party" : "parties"} ahead of you.`}</span></div>
                {ticket.upNextAt && <p className={styles.notice}>Feel free to head back to La Chingada. This is a heads-up, not a table offer yet. Wait for the five-minute offer before checking in.</p>}
                <p className={styles.finePrint}>Position updates automatically. Seating depends on party size and the right table becoming free, so this isn&apos;t a guaranteed order or wait time.</p>
              </>
            )}
            {ticket.status === "offered" && (
              <div className={styles.offer} role="status">
                <p className={styles.kicker}>YOUR TABLE IS READY</p>
                <h2>YOU IN?</h2>
                <div className={styles.countdown} aria-label={`${countdown} remaining`}>{countdown}</div>
                <p>{remaining ? "Say yes before the timer runs out, or we'll offer the table to the next party." : "The response window has ended. Checking the final status..."}</p>
                <div className={styles.responseButtons}>
                  <button className="button button-dark" disabled={busy || !remaining} onClick={() => void respond("accept")}><Check size={20} /> YES, WE WANT IT</button>
                  <button className="button button-outline" disabled={busy || !remaining} onClick={() => void respond("decline")}><X size={20} /> NO, THANKS</button>
                </div>
              </div>
            )}
            {ticket.status === "accepted" && (
              <>
                <div className={styles.acceptedMark}><Check size={40} /></div>
                <h2>IT&apos;S YOURS.</h2>
                <p>Head to the host at La Chingada and give your name. {ticket.arrivalDeadline && <>Please arrive by <strong>{formatInTimeZone(new Date(ticket.arrivalDeadline), RESTAURANT_TIMEZONE, "h:mm a")}</strong> or your table may be released.</>}</p>
                {ticket.reservationCode && <p className={styles.code}>{ticket.reservationCode}</p>}
                <a className={styles.textLink} href="https://www.google.com/maps/search/?api=1&query=La+Chingada+Toronto" target="_blank" rel="noreferrer">DIRECTIONS TO LA CHINGADA</a>
              </>
            )}
            {terminal && (
              <>
                <h2>{ticket.status === "seated" ? "BUEN PROVECHO." : ticket.status === "expired" ? "MISSED THIS ONE." : "YOU'RE OFF THE LIST."}</h2>
                <p>{ticket.status === "seated" ? "You're seated. Enjoy your time at La Chingada!" : ticket.status === "expired" ? "Your waitlist place or table offer expired. You're welcome to join the end of today's queue again." : "Your place has been released. Come back when you're ready."}</p>
                <button className="button button-pink" onClick={startAgain}>{ticket.status === "seated" ? "JOIN A NEW VISIT" : "JOIN AGAIN"}</button>
              </>
            )}
            {!terminal && (
              <div className={styles.notificationCard}>
                <BellRing size={20} />
                <div><strong>{ticket.pushEnabled ? "PUSH ALERTS ENABLED" : "DON'T MISS YOUR TABLE"}</strong><p>{ticket.pushEnabled ? "We'll send up-next and table-offer alerts. This page also updates live." : "Keep this page open to see updates. For background alerts, enable notifications."}</p></div>
                {publicKey && pushSupported && !ticket.pushEnabled && <button className="button button-yellow" disabled={busy} onClick={() => void enablePush()}>ENABLE ALERTS</button>}
                {!ticket.pushEnabled && <p className={styles.finePrint}>On iPhone: open in Safari, tap Share, then Add to Home Screen. Open the saved app and enable alerts. If your browser doesn&apos;t support push, keep this ticket open. Push delivery depends on your device and connection.</p>}
              </div>
            )}
            {!terminal && ticket.status !== "offered" && <button className={styles.leaveButton} disabled={busy} onClick={() => void respond("leave")}>LEAVE THE WAITLIST</button>}
            <p className={styles.finePrint}>This is your private ticket. Don&apos;t share its link.</p>
          </>
        )}
        <details className={styles.rules}>
          <summary>THE LITTLE DETAILS</summary>
          <ul>
            <li>Today&apos;s walk-in waitlist only. Joining isn&apos;t a reservation or a guaranteed table.</li>
            <li>Up to 6 guests per party. For larger groups, please speak to the host.</li>
            <li>Five minutes to accept or decline a table offer. No answer means the table goes to the next eligible party.</li>
            <li>After saying yes, arrive within 15 minutes and check in with the host. At least half your party must be present to sit.</li>
            <li>Two-hour tables. Parties of 6: one bill and an 18% gratuity. No combining tables.</li>
          </ul>
          <a href="tel:+14165352242">(416) 535-2242</a>
        </details>
      </section>
    </main>
  );
}
