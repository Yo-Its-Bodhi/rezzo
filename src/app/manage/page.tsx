import { ManageBooking } from "@/components/manage-booking";
import Image from "next/image";
import { SiteHeader } from "@/components/site-header";
import { ReservationFooter } from "@/components/reservation-footer";

export default function ManagePage() {
  return (
    <div className="guest-page guest-manage-page">
      <a className="reservation-skip" href="#manage-booking">
        Skip to your booking
      </a>
      <SiteHeader />
      <main className="reservation-manage-layout" id="manage-booking">
        <section className="reservation-manage-intro">
          <p className="reservation-eyebrow">A LITTLE CHANGE OF PLANS?</p>
          <h1>
            YOUR TABLE.
            <br />
            YOUR NEXT MOVE.
          </h1>
          <p>
            Look up your reservation to check the details, make a change or
            cancel.
          </p>
          <p>
            Within 24 hours of your booking?
            <br />
            <a href="tel:+14165352242">Call us: (416) 535-2242 ↗</a>
          </p>
          <figure className="reservation-manage-photo">
            <Image
              src="/images/neon-dining-room-960.webp"
              width={960}
              height={960}
              alt="Colourful papel picado and warm lights inside La Chingada's dining room"
              sizes="(max-width: 850px) 100vw, 42vw"
            />
            <figcaption>SAME GOOD PLACE. A LITTLE CHANGE OF PLANS.</figcaption>
          </figure>
        </section>
        <ManageBooking />
      </main>
      <ReservationFooter />
    </div>
  );
}
