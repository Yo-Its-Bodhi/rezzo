import { SiteHeader } from "@/components/site-header";
import { WaitlistForm } from "@/components/waitlist-form";

export default function WaitlistPage() {
  return (
    <>
      <SiteHeader />
      <main className="waitlist-shell">
        <section className="waitlist-intro">
          <p className="eyebrow">NO RESERVATION? NO PROBLEM.</p>
          <h1>GET IN<br />THE <span>QUEUE.</span></h1>
          <p>
            Join from the door. When your table is ready, you get five minutes to say
            yes before we offer it to the next hungry person.
          </p>
          <div className="five-stamp"><strong>5</strong><span>MINUTES<br />TO REPLY</span></div>
        </section>
        <WaitlistForm />
      </main>
    </>
  );
}
