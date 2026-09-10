import "server-only";

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/demo";

const COOKIE_NAME = "rezzo_staff_session";
const SESSION_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  role: "admin";
  exp: number;
};

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function verifyPasscode(passcode: string) {
  const configured = process.env.STAFF_PASSCODE_HASH;
  if (!configured) throw new Error("STAFF_PASSCODE_HASH is not configured.");
  const [algorithm, salt, expectedEncoded] = configured.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedEncoded) {
    throw new Error("STAFF_PASSCODE_HASH must use the scrypt$salt$hash format.");
  }
  const expected = Buffer.from(expectedEncoded, "base64url");
  const actual = scryptSync(passcode, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createStaffSession() {
  const payload: SessionPayload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearStaffSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hasStaffSession() {
  if (isDemoMode()) return true;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    return payload.role === "admin" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
