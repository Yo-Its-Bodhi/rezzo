"use client";

import Image from "next/image";
import styles from "./waitlist-sign.module.css";

export function WaitlistSign({ qr, url }: { qr: string; url: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <button onClick={() => window.print()}>PRINT / SAVE PDF</button>
        <a download="la-chingada-waitlist-qr.png" href={qr}>DOWNLOAD QR</a>
        <a href="/admin">BACK TO STAFF</a>
        <p>Letter-size portrait. Print at 100%, with backgrounds on and browser headers/footers off.</p>
      </div>
      <article className={styles.sign}>
        <header className={styles.brand}><span aria-hidden="true">✦</span><div>LA CHINGADA<small>MEXICAN KITCHEN / DUNDAS WEST</small></div><span aria-hidden="true">✦</span></header>
        <section className={styles.headline}>
          <p>THE GOOD STUFF IS WORTH THE WAIT.</p>
          <h1>NO TABLE?<br /><span>NO PROBLEMA.</span></h1>
          <div className={styles.ribbon}>JOIN THE WAITLIST. NOT THE CROWD.</div>
        </section>
        <section className={styles.scan}>
          <div className={styles.qr}>
            <Image src={qr} width={600} height={600} unoptimized alt={`Scan to join La Chingada's waitlist at ${url}`} />
            <strong>SCAN ME. GET IN LINE.</strong>
          </div>
          <div className={styles.steps}>
            <div><b>01</b><p><strong>SCAN & JOIN</strong>Your name. Your crew.<br />Your place in the queue.</p></div>
            <div><b>02</b><p><strong>STAY IN THE KNOW</strong>Keep your ticket open.<br />Enable alerts. Stay nearby.</p></div>
            <div><b>03</b><p><strong>YOUR TABLE. YOUR CALL.</strong>When the offer lands,<br />say yes or no.</p></div>
          </div>
        </section>
        <section className={styles.deadline}>
          <strong>5<span>MIN</span></strong>
          <div><h2>DON&apos;T GHOST YOUR TACOS.</h2><p>Five minutes to accept your table.<br />No reply? We pass it to the next party.</p></div>
        </section>
        <footer className={styles.footer}>
          <a href={url}>{url.replace(/^https?:\/\//, "")}</a>
          <p>No camera? Ask our host. We&apos;re happy to help.</p>
          <small>Up to 6 guests · Table availability applies · After accepting, arrive within 15 minutes.<br />Joining the waitlist is not a reservation. Your live ticket has the full details.</small>
        </footer>
      </article>
    </main>
  );
}
