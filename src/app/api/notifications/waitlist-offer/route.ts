import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  entryId: z.string().min(1),
  guestName: z.string().min(1).max(120),
  phone: z.string().min(7).max(30),
  email: z.string().email(),
  partySize: z.number().int().min(1).max(20),
  expiresAt: z.string().datetime(),
});

type ChannelResult = {
  channel: "sms" | "email";
  sent: boolean;
  error?: string;
};

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

async function sendSms(
  data: z.infer<typeof requestSchema>,
  responseUrl: string,
): Promise<ChannelResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return { channel: "sms", sent: false, error: "Twilio is not configured." };
  }

  const body = new URLSearchParams({
    To: normalizePhone(data.phone),
    From: from,
    Body: `La Chingada: Your table for ${data.partySize} is ready. You have 5 minutes to accept or decline: ${responseUrl}`,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    return {
      channel: "sms",
      sent: false,
      error: error?.message ?? `Twilio returned ${response.status}.`,
    };
  }
  return { channel: "sms", sent: true };
}

async function sendEmail(
  data: z.infer<typeof requestSchema>,
  responseUrl: string,
): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { channel: "email", sent: false, error: "Resend is not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [data.email],
      subject: "Your table at La Chingada is ready",
      text: `Hi ${data.guestName}, your table for ${data.partySize} is ready. Accept or decline within 5 minutes: ${responseUrl}`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    return {
      channel: "email",
      sent: false,
      error: error?.message ?? `Resend returned ${response.status}.`,
    };
  }
  return { channel: "email", sent: true };
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid waitlist offer." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      {
        error: "APP_URL is not configured.",
        results: [
          { channel: "sms", sent: false, error: "APP_URL is not configured." },
          { channel: "email", sent: false, error: "APP_URL is not configured." },
        ],
      },
      { status: 503 },
    );
  }

  const responseUrl = `${appUrl.replace(/\/$/, "")}/waitlist/respond?id=${encodeURIComponent(parsed.data.entryId)}`;
  const results = await Promise.all([
    sendSms(parsed.data, responseUrl),
    sendEmail(parsed.data, responseUrl),
  ]);
  const sentCount = results.filter((result) => result.sent).length;

  return NextResponse.json(
    { results },
    { status: sentCount > 0 ? 200 : 502 },
  );
}
