import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffSession, verifyPasscode } from "@/lib/auth";
import { db } from "@/lib/db";

const loginSchema = z.object({ passcode: z.string().min(1).max(256) });
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the staff passcode." }, { status: 400 });
  }

  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const clientKey = createHash("sha256").update(forwarded).digest("hex");
  const sql = db();
  const result = await sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${clientKey}))`;
    const [attempts] = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM staff_login_attempts
      WHERE client_key = ${clientKey}
        AND attempted_at > now() - (${WINDOW_MINUTES} * interval '1 minute')
    `;
    if (attempts.count >= MAX_ATTEMPTS) return "limited" as const;
    if (!verifyPasscode(parsed.data.passcode)) {
      await transaction`INSERT INTO staff_login_attempts (client_key) VALUES (${clientKey})`;
      return "invalid" as const;
    }
    await transaction`DELETE FROM staff_login_attempts WHERE client_key = ${clientKey}`;
    return "success" as const;
  });
  if (result === "limited") {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }
  if (result === "invalid") {
    return NextResponse.json({ error: "That passcode is not correct." }, { status: 401 });
  }
  await createStaffSession();
  return NextResponse.json({ ok: true });
}
