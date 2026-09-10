import { createECDH, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: send } }));
vi.mock("@/lib/restaurant", async () => import("./restaurant"));
import { defaultRestaurantState } from "./state";
import { joinWaitlist, staffWaitlistAction, waitlistJoinSchema } from "./waitlist-engine";
import { sendWaitlistPush, waitlistPushPublicKey, waitlistSubscriptionSchema } from "./waitlist-push";

function subscription(endpoint = "https://fcm.googleapis.com/fcm/send/test") {
  const key = createECDH("prime256v1");
  key.generateKeys();
  return { endpoint, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
function offeredEntry() {
  const state = defaultRestaurantState();
  const { entry } = joinWaitlist(state, waitlistJoinSchema.parse({
    guestName: "Guest", phone: "4165550100", partySize: 4, consent: true,
  }));
  staffWaitlistAction(state, entry.id, "offer", "t11");
  entry.pushSubscription = subscription();
  return entry;
}
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  vi.stubEnv("APP_URL", "https://restaurant.example");
  const vapid = createECDH("prime256v1");
  vapid.generateKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.getPublicKey().toString("base64url"));
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.getPrivateKey().toString("base64url"));
  vi.stubEnv("VAPID_SUBJECT", "mailto:host@restaurant.example");
  send.mockReset().mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());

describe("safe web push", () => {
  it.each([
    "http://fcm.googleapis.com/path", "https://127.0.0.1/path", "https://localhost/path",
    "https://fcm.googleapis.com.evil.example/path", "https://fcm.googleapis.com@evil.example/path",
    "https://fcm.googleapis.com:8443/path", "https://fcm.googleapis.com/path#fragment",
    "https://evil.example", "https://user:pass@web.push.apple.com/path",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(waitlistSubscriptionSchema.safeParse(subscription(endpoint)).success).toBe(false);
  });
  it.each([
    "https://fcm.googleapis.com/fcm/send/123",
    "https://updates.push.services.mozilla.com/wpush/v2/123",
    "https://web.push.apple.com/123", "https://wns2-par02p.notify.windows.com/w/?token=test",
  ])("allows known push service %s", (endpoint) => {
    expect(waitlistSubscriptionSchema.safeParse(subscription(endpoint)).success).toBe(true);
  });
  it("rejects malformed and oversized encryption keys", () => {
    const value = subscription();
    expect(waitlistSubscriptionSchema.safeParse({ ...value, keys: { ...value.keys, auth: "bad" } }).success).toBe(false);
    expect(waitlistSubscriptionSchema.safeParse({ ...value, keys: { ...value.keys, p256dh: "a".repeat(10000) } }).success).toBe(false);
  });
  it("uses only canonical APP_URL, bearer fragment, short TTL, and configured VAPID", async () => {
    const entry = offeredEntry();
    const result = await sendWaitlistPush(entry, "offer");
    expect(result.delivery.sent).toBe(true);
    const [, body, options] = send.mock.calls[0];
    expect(JSON.parse(body)).toMatchObject({ title: expect.stringContaining("table is ready"), url: expect.stringMatching(/^https:\/\/restaurant\.example\/waitlist#token=/) });
    expect(options.TTL).toBeLessThanOrEqual(300);
    expect(options.timeout).toBe(10_000);
    expect(options.vapidDetails.subject).toBe("mailto:host@restaurant.example");
    expect(JSON.stringify(result)).not.toContain(process.env.VAPID_PRIVATE_KEY);
  });
  it("makes the up-next message explicitly advisory", async () => {
    await sendWaitlistPush(offeredEntry(), "up_next");
    expect(JSON.parse(send.mock.calls[0][1]).body).toContain("not guaranteed");
  });
  it("uses SMS when push is missing or unconfigured and Twilio is available via API key", async () => {
    const entry = offeredEntry();
    delete entry.pushSubscription;
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_API_KEY", "SK123");
    vi.stubEnv("TWILIO_API_SECRET", "secret123");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+14165550123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ sid: "SM123" }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendWaitlistPush(entry, "offer");
    expect(result.delivery).toMatchObject({ channel: "sms", sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/Accounts/AC123/Messages.json");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(new URLSearchParams(init.body).get("To")).toBe(entry.phone);
    expect(new URLSearchParams(init.body).get("From")).toBe("+14165550123");
  });
  it("never fakes success when push is missing or unconfigured", async () => {
    const entry = offeredEntry();
    delete entry.pushSubscription;
    expect((await sendWaitlistPush(entry, "offer")).delivery).toMatchObject({ sent: false, error: expect.stringContaining("No push") });
    entry.pushSubscription = subscription();
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(waitlistPushPublicKey()).toBeNull();
    expect((await sendWaitlistPush(entry, "offer")).delivery.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not derive notification URLs from untrusted request data or invalid APP_URL", async () => {
    vi.stubEnv("APP_URL", "http://evil.example");
    expect((await sendWaitlistPush(offeredEntry(), "offer")).delivery.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([404, 410])("invalidates dead subscriptions for status %s without exposing provider data", async (statusCode) => {
    send.mockRejectedValue({ statusCode, message: "provider-secret", body: "secret" });
    const result = await sendWaitlistPush(offeredEntry(), "offer");
    expect(result).toMatchObject({ invalidate: true, delivery: { sent: false } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("surfaces delivery failure and does not invalidate transient failures or redirects", async () => {
    send.mockRejectedValue({ statusCode: 302, message: "secret location" });
    const result = await sendWaitlistPush(offeredEntry(), "offer");
    expect(result).toMatchObject({ invalidate: false, delivery: { sent: false } });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
