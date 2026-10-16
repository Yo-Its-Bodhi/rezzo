import "server-only";

import { ECDH } from "node:crypto";
import webpush from "web-push";
import { demoModeEnabled } from "./demo-mode";
import { z } from "zod";
import type { StoredWaitlistEntry } from "./restaurant";
import { waitlistCredential } from "./waitlist-engine";
import type { WaitlistDelivery } from "./waitlist-types";

function twilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  const apiKey = process.env.TWILIO_API_KEY?.trim();
  const apiSecret = process.env.TWILIO_API_SECRET?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !fromNumber) return null;
  const credentials = apiKey && apiSecret ? { username: apiKey, password: apiSecret } : authToken ? { username: accountSid, password: authToken } : null;
  if (!credentials) return null;
  return { accountSid, fromNumber, username: credentials.username, password: credentials.password };
}

async function sendTwilioSms(entry: StoredWaitlistEntry, kind: "offer" | "up_next", invalidate = false) {
  const config = twilioConfiguration();
  if (!config) {
    return { delivery: { channel: "sms" as const, sent: false, error: "SMS notifications are not configured." }, invalidate };
  }
  const body = kind === "offer"
    ? `La Chingada: a table for ${entry.partySize} is ready. Open your ticket to accept within 5 minutes.`
    : "La Chingada: you are up next. Keep your ticket open for the latest update.";
  const params = new URLSearchParams({
    To: entry.phone,
    From: config.fromNumber,
    Body: body,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    },
    body: params.toString(),
  });
  if (!response.ok) {
    const payload = await response.text();
    return {
      delivery: { channel: "sms" as const, sent: false, error: `Twilio SMS delivery failed: ${payload.slice(0, 200)}` },
      invalidate,
    };
  }
  return { delivery: { channel: "sms" as const, sent: true }, invalidate };
}

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
      (!url.port || url.port === "443") && (
        ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
      );
  } catch { return false; }
}

function validKey(value: string, bytes: number) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
  const buffer = Buffer.from(value, "base64url");
  if (buffer.length !== bytes) return false;
  if (bytes === 65) {
    try { ECDH.convertKey(buffer, "prime256v1"); } catch { return false; }
  }
  return true;
}

export const waitlistSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(validEndpoint),
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().max(100).refine((key) => validKey(key, 65)),
    auth: z.string().max(30).refine((key) => validKey(key, 16)),
  }),
});

function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject || !validKey(publicKey, 65) || !validKey(privateKey, 32)) return null;
  try {
    const parsed = new URL(subject);
    if (!["https:", "mailto:"].includes(parsed.protocol)) return null;
  } catch { return null; }
  return { publicKey, privateKey, subject };
}

export function waitlistPushPublicKey() {
  if (demoModeEnabled(process.env)) return null;
  return pushConfiguration()?.publicKey ?? null;
}

function canonicalGuestUrl(entry: StoredWaitlistEntry) {
  const configured = process.env.APP_URL;
  if (!configured) return null;
  try {
    const base = new URL(configured);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return new URL(`/waitlist#token=${encodeURIComponent(waitlistCredential(entry))}`, base.origin).href;
  } catch { return null; }
}

export async function sendWaitlistPush(
  entry: StoredWaitlistEntry, kind: "offer" | "up_next",
): Promise<{ delivery: WaitlistDelivery; invalidate: boolean }> {
  const failure = (error: string, invalidate = false) => ({
    delivery: { channel: "push" as const, sent: false, error }, invalidate,
  });

  if (demoModeEnabled(process.env)) return failure("Notifications are disabled in this demo preview.");

  if (!entry.pushSubscription) {
    return twilioConfiguration()
      ? sendTwilioSms(entry, kind)
      : failure("No push subscription. The guest must keep their ticket open to see updates.");
  }

  const parsed = waitlistSubscriptionSchema.safeParse(entry.pushSubscription);
  if (!parsed.success) {
    return twilioConfiguration()
      ? sendTwilioSms(entry, kind, true)
      : failure("The push subscription is invalid.", true);
  }

  const vapidDetails = pushConfiguration();
  if (!vapidDetails) {
    return twilioConfiguration()
      ? sendTwilioSms(entry, kind)
      : failure("Push notifications are not configured. The guest can still check their ticket.");
  }

  const url = canonicalGuestUrl(entry);
  if (!url) {
    return twilioConfiguration()
      ? sendTwilioSms(entry, kind)
      : failure("The notification link is not configured. The guest can still check their ticket.");
  }

  try {
    const remaining = kind === "offer" ? Math.floor((Date.parse(entry.offerExpiresAt ?? "") - Date.now()) / 1000) : 300;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return twilioConfiguration()
        ? sendTwilioSms(entry, kind)
        : failure("The offer expired before notification delivery.");
    }
    // web-push uses https.request and rejects non-2xx; it does not follow redirects.
    const response = await webpush.sendNotification(parsed.data, JSON.stringify({
      title: kind === "offer" ? "Your table is ready · La Chingada" : "You're up next · La Chingada",
      body: kind === "offer"
        ? `A table for ${entry.partySize} is ready. Open your ticket to accept within 5 minutes.`
        : "Feel free to head here. You're up next, but a table is not guaranteed yet. Keep your ticket open.",
      url,
    }), { vapidDetails, TTL: Math.min(300, remaining), urgency: "high", timeout: 10_000 });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return twilioConfiguration() && [404, 410].includes(response.statusCode)
        ? sendTwilioSms(entry, kind, [404, 410].includes(response.statusCode))
        : failure("The push service did not accept the notification.", [404, 410].includes(response.statusCode));
    }
    return { delivery: { channel: "push", sent: true }, invalidate: false };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    const expired = status === 404 || status === 410;
    if (twilioConfiguration() && expired) return sendTwilioSms(entry, kind, true);
    return failure(
      status === 404 || status === 410
        ? "The push subscription expired. The guest must enable notifications again."
        : "Push delivery failed. The guest can still see the update on their ticket.",
      expired,
    );
  }
}
