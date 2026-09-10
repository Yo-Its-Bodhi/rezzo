import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type WorkerEvent = {
  data?: { json: () => unknown };
  notification?: { close: () => void; data: { url: string } };
  waitUntil: (promise: Promise<unknown>) => void;
};
let handlers: Record<string, (event: WorkerEvent) => void>;
const showNotification = vi.fn();
const openWindow = vi.fn();
const matchAll = vi.fn();
const origin = "https://restaurant.example";
const ticketUrl = `${origin}/waitlist#token=private-ticket`;
beforeEach(() => {
  handlers = {};
  showNotification.mockReset().mockResolvedValue(undefined);
  openWindow.mockReset().mockResolvedValue(undefined);
  matchAll.mockReset().mockResolvedValue([]);
  runInNewContext(readFileSync(new URL("../../public/waitlist-sw.js", import.meta.url), "utf8"), {
    URL,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => { handlers[name] = handler; },
      registration: { showNotification },
      clients: { openWindow, matchAll },
    },
  });
});
describe("waitlist service worker", () => {
  it("shows push notifications with the private ticket link", async () => {
    let pending = Promise.resolve();
    handlers.push({
      data: { json: () => ({ title: "Table ready", body: "Accept now", url: ticketUrl }) },
      waitUntil: (promise) => { pending = promise as Promise<void>; },
    });
    await pending;
    expect(showNotification).toHaveBeenCalledWith("Table ready", {
      body: "Accept now", tag: "rezzo-waitlist", data: { url: ticketUrl },
    });
  });
  it("ignores malformed data and external links", () => {
    handlers.push({ data: { json: () => { throw new Error("bad JSON"); } }, waitUntil: vi.fn() });
    handlers.push({ data: { json: () => ({ title: "Bad", body: "Bad", url: "https://evil.example/waitlist" }) }, waitUntil: vi.fn() });
    expect(showNotification).not.toHaveBeenCalled();
  });
  it("opens the ticket when no guest tab is open", async () => {
    let pending: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url: ticketUrl } },
      waitUntil: (promise) => { pending = promise; },
    });
    await pending;
    expect(openWindow).toHaveBeenCalledWith(ticketUrl);
  });
  it("navigates and focuses an existing guest tab to the notification's ticket", async () => {
    const focus = vi.fn();
    const navigate = vi.fn().mockResolvedValue({ focus });
    matchAll.mockResolvedValue([{ url: `${origin}/waitlist#token=previous`, navigate }]);
    let pending: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url: ticketUrl } },
      waitUntil: (promise) => { pending = promise; },
    });
    await pending;
    expect(navigate).toHaveBeenCalledWith(ticketUrl);
    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
