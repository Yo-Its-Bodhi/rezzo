import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { StaffLoginForm } from "@/components/staff-login-form";
import { hasStaffSession } from "@/lib/auth";

export default async function StaffLoginPage() {
  if (await hasStaffSession()) redirect("/admin");
  return (
    <div className="login-page">
      <SiteHeader />
      <main className="login-shell">
        <section>
          <p className="eyebrow">PRIVATE STAFF ACCESS</p>
          <h1>CONTROL<br /><span>THE NIGHT.</span></h1>
          <p>Reservations, arrivals, floor controls, and service settings live behind this door.</p>
        </section>
        <section className="login-card">
          <p className="step-label">AUTHORIZED STAFF ONLY</p>
          <h2>WELCOME BACK.</h2>
          <StaffLoginForm />
        </section>
      </main>
    </div>
  );
}
