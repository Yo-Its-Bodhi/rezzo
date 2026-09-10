"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function StaffLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: form.get("passcode") }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Login failed.");
      setSubmitting(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label>
        STAFF PASSCODE
        <input name="passcode" type="password" autoComplete="current-password" autoFocus required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark" disabled={submitting}>
        {submitting ? "CHECKING..." : "ENTER CONTROL ROOM"}
      </button>
    </form>
  );
}
