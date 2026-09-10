import "server-only";

import { WAITLIST_ENABLED } from "./features";
import { WaitlistError } from "./waitlist-engine";

export function waitlistJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function waitlistRoute(run: () => Promise<Response>) {
  if (!WAITLIST_ENABLED) return waitlistJson({ error: "The waitlist is not enabled." }, 503);
  try { return await run(); } catch (error) {
    return waitlistJson({
      error: error instanceof WaitlistError ? error.message : "Waitlist service is unavailable. Please try again.",
    }, error instanceof WaitlistError ? error.status : 503);
  }
}

export function waitlistBearer(request: Request) {
  return /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

export async function waitlistBody(request: Request) {
  const text = await request.text();
  if (text.length > 8192) throw new WaitlistError("Request is too large.", 413);
  try { return JSON.parse(text) as unknown; } catch { throw new WaitlistError("Invalid JSON request.", 400); }
}
