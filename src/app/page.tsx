import { BookingFlow } from "@/components/booking-flow";
import { SiteHeader } from "@/components/site-header";
import { RESERVATION_POLICIES, RESERVATION_POLICY_NOTE } from "@/lib/restaurant";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="booking-shell">
        <section className="booking-intro">
          <p className="eyebrow">MEXICAN STREET FOOD · DUNDAS WEST</p>
          <h1>
            YOUR TABLE.
            <br />
            <span>OUR TACOS.</span>
            <br />
            NO BULLSHIT.
          </h1>
          <p className="intro-copy">
            Two hours. Serious food. Questionable behaviour. Lock in your table before
            somebody else does.
          </p>
          <details className="intro-policies">
            <summary>KNOW BEFORE YOU BOOK</summary>
            <ul>
              {RESERVATION_POLICIES.map((policy) => <li key={policy}>{policy}</li>)}
            </ul>
            <p>{RESERVATION_POLICY_NOTE}</p>
          </details>
          <div className="intro-sticker" aria-hidden>
            <span>2 HR</span>
            TABLES
          </div>
        </section>
        <BookingFlow />
      </main>
      <footer className="site-footer">
        <span>LA CHINGADA · 1242 DUNDAS ST W</span>
        <span>NO PATIO RESERVATIONS. EVER.</span>
      </footer>
    </>
  );
}
