import { isDemoMode } from "@/lib/demo";

/** Determined by the server, including an explicitly enabled staged production build. */
export function DemoNotice() {
  if (!isDemoMode()) return null;
  return (
    <aside className="reservation-demo-notice" aria-label="Demo preview">
      <strong>DEMO PREVIEW</strong>
      <span>
        SAMPLE DATA ONLY. Use made-up details. No real table is booked and no
        customer email or notification is sent. Demo reservations are shared in
        memory and reset on restart.
      </span>
    </aside>
  );
}
