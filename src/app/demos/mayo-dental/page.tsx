"use client";

import { useState } from "react";
import Link from "next/link";
import OfficeMap from "./_components/OfficeMap";

const BASE = "/demos/mayo-dental";

const TESTIMONIALS = [
  {
    text: "Dr. Keer is excellent, very gentle and she has great skills. I used to REALLY not like the dentist, but now I don't mind going at all.",
    author: "Diane T.",
  },
  {
    text: "I've been a patient here for over 5 years and have received excellent care and outstanding service from the front office.",
    author: "David E.",
  },
  {
    text: "Me and my family have been coming here for years. I've never felt more comfortable anywhere else than Mayo Dental.",
    author: "Priscilla P.",
  },
];

const SERVICES = [
  {
    title: "General and Preventive Dentistry",
    desc: "Prevention is the best medicine. We offer routine dental services and deep cleanings so you can keep your smile healthy and bright.",
  },
  {
    title: "Cosmetic Dentistry and Smile Makeovers",
    desc: "We offer a variety of cosmetic dental procedures to improve your smile and help you feel confident every day.",
  },
  {
    title: "Restorative Dentistry",
    desc: "Same-day crowns (CEREC), implants, dentures, and bridges. We restore your smile in as few visits as possible.",
  },
  {
    title: "Orthodontic Treatment",
    desc: "ClearCorrect invisible aligners for a straighter smile, without the hassle of traditional braces.",
  },
  {
    title: "Emergency Dental Care",
    desc: "Do you have a fractured tooth or a severe toothache? Don't wait. We offer same-day emergency appointments.",
  },
];

const TECH = [
  {
    title: "Same-Day Crowns (CEREC)",
    desc: "One visit. No temporaries. Walk out with a permanent crown the same day.",
  },
  {
    title: "Digital X-Rays",
    desc: "80% less radiation than standard X-rays. Instant on-screen results you can review with your doctor.",
  },
  {
    title: "Intraoral Camera",
    desc: "SOPROLIFE intraoral camera for precise digital imaging. No messy impressions.",
  },
  {
    title: "Panoramic X-Ray",
    desc: "A single image of your entire mouth for comprehensive diagnosis in seconds.",
  },
];

const WHY = [
  "We have a compassionate team",
  "Our facility offers a welcoming and comforting environment",
  "Our office is handicapped accessible",
  "We offer painless dentistry",
];

const HOURS = [
  { day: "Mon - Thu", hours: "9:00 AM - 5:00 PM" },
  { day: "Friday",    hours: "8:00 AM - 2:00 PM" },
  { day: "Saturday",  hours: "8:00 AM - 2:00 PM (alternating)" },
];

function Stars() {
  return (
    <div className="flex gap-0.5 justify-center mb-3">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="18" height="18" viewBox="0 0 18 18" fill="#f59e0b">
          <path d="M9 1l2.47 5.01L17 6.94l-4 3.9.94 5.5L9 13.77l-4.94 2.57.94-5.5-4-3.9 5.53-.93L9 1z"/>
        </svg>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
      <circle cx="8" cy="8" r="8" fill="#339e35"/>
      <path d="M5 8l2.5 2.5L11.5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ServiceIcon() {
  return (
    <div className="w-10 h-10 rounded bg-[#002b7f]/10 flex items-center justify-center mb-3 shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#002b7f" strokeWidth="1.5">
        <path d="M12 2C9.24 2 8 4.5 8 6.5c0 .5.07.97.2 1.42L7 9H5a1 1 0 00-.95.68L3.1 12.5A2 2 0 005 15h1l.5 5a1 1 0 001 .9h9a1 1 0 001-.9l.5-5h1a2 2 0 001.9-2.5l-.95-2.82A1 1 0 0019 9h-2l-1.2-1.08c.13-.45.2-.92.2-1.42C16 4.5 14.76 2 12 2z"/>
      </svg>
    </div>
  );
}

function ImagePlaceholder({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`bg-[#002b7f]/08 border-2 border-dashed border-[#002b7f]/20 rounded-xl flex flex-col items-center justify-center gap-3 ${className}`}
      style={{ backgroundColor: "rgba(0,43,127,0.05)" }}
    >
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="26" fill="#002b7f" fillOpacity="0.1" />
        <circle cx="26" cy="20" r="8" fill="#002b7f" fillOpacity="0.3" />
        <path d="M8 46c0-9.9 8.1-18 18-18s18 8.1 18 18" fill="#002b7f" fillOpacity="0.18" />
      </svg>
      <span className="text-[#002b7f]/60 text-xs font-medium text-center px-4">{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [idx, setIdx] = useState(0);
  const prev = () => setIdx(i => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const next = () => setIdx(i => (i + 1) % TESTIMONIALS.length);

  return (
    <>
      {/* Hero */}
      <section className="bg-[#002b7f] text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-4">
            Edgewater Dentists
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-5 leading-tight">
            Dental Care for the Whole Family
          </h1>
          <p className="text-white/80 text-lg sm:text-xl mb-8 max-w-2xl mx-auto leading-relaxed">
            From routine cleaning to emergency dental care to cosmetic procedures, we care for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`${BASE}/services`}
              className="px-7 py-3.5 bg-white text-[#002b7f] font-semibold rounded text-base hover:bg-gray-100 transition-colors"
            >
              Our Services
            </Link>
            <Link
              href={`${BASE}/contact`}
              className="px-7 py-3.5 bg-[#339e35] text-white font-semibold rounded text-base hover:bg-[#2a7a2c] transition-colors"
            >
              Schedule an Appointment
            </Link>
          </div>
        </div>
      </section>

      {/* Quick access */}
      <section className="bg-white border-b border-[#e4e4e4] py-8 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Meet the Team",   href: `${BASE}/meet-the-team` },
            { label: "Our Services",    href: `${BASE}/services` },
            { label: "New Patients",    href: `${BASE}/contact` },
            { label: "Contact Us",      href: `${BASE}/contact` },
          ].map(tile => (
            <Link
              key={tile.label}
              href={tile.href}
              className="flex flex-col items-center gap-2.5 p-5 rounded border border-[#e4e4e4] hover:border-[#002b7f]/40 hover:shadow-md hover:-translate-y-0.5 transition-all text-center group"
            >
              <div className="w-10 h-10 rounded-full bg-[#002b7f]/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="#002b7f">
                  <path d="M8 0C5.24 0 3 2.24 3 5c0 3.75 5 11 5 11s5-7.25 5-11c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-[#252525] group-hover:text-[#002b7f] transition-colors">
                {tile.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Welcome */}
      <section className="bg-[#f8f9fb] py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-3">
              Welcome to Mayo Dental
            </p>
            <h2 className="text-3xl font-bold text-[#002b7f] mb-4 leading-tight">
              Friendly and Gentle Team of Dentists
            </h2>
            <p className="text-[#494949] leading-relaxed mb-4">
              Your smile is one of the first things people notice about you. Make your smile shine with
              general or cosmetic dentistry from our team at Mayo Dental.
            </p>
            <p className="text-[#494949] leading-relaxed mb-4">
              At our dental office, we have more than 10 years of experience offering high-quality
              service in the Edgewater area.
            </p>
            <p className="text-[#494949] leading-relaxed mb-6">
              If you are looking for a friendly, experienced dentist, contact us today at{" "}
              <a href="tel:4109566626" className="text-[#002b7f] font-semibold">
                410-956-6626
              </a>{" "}
              and get that smile you deserve.
            </p>
            <Link href={`${BASE}/meet-the-team`} className="text-[#002b7f] font-semibold text-sm hover:text-[#339e35] transition-colors">
              Meet the Doctors
            </Link>
          </div>
          <ImagePlaceholder label="Office / Team Photo" className="h-72" />
        </div>
      </section>

      {/* Services */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-2 text-center">
            What We Offer
          </p>
          <h2 className="text-3xl font-bold text-[#002b7f] text-center mb-3">
            We Offer Services for the Whole Family
          </h2>
          <p className="text-[#494949] text-center max-w-2xl mx-auto mb-10 leading-relaxed">
            From routine cleanings to crowns, bridgework, dentures, oral surgery, and the latest in
            dental implants. If you experience harsh symptoms, we can accommodate you the same day.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(svc => (
              <Link
                key={svc.title}
                href={`${BASE}/services`}
                className="p-6 rounded border border-[#e4e4e4] hover:border-[#002b7f]/40 hover:shadow-md transition-all group"
              >
                <ServiceIcon />
                <h3 className="text-base font-semibold text-[#252525] mb-2 group-hover:text-[#002b7f] transition-colors">
                  {svc.title}
                </h3>
                <p className="text-sm text-[#494949] leading-relaxed">{svc.desc}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href={`${BASE}/services`}
              className="inline-block px-6 py-2.5 border-2 border-[#002b7f] text-[#002b7f] font-semibold rounded text-sm hover:bg-[#002b7f] hover:text-white transition-colors"
            >
              View All Services
            </Link>
          </div>
        </div>
      </section>

      {/* Technology */}
      <section className="bg-[#002b7f] text-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2 text-center">
            Our Technology
          </p>
          <h2 className="text-3xl font-bold text-center mb-2">
            Cutting-Edge Technology
          </h2>
          <p className="text-white/70 text-center mb-10 leading-relaxed">
            We believe in constantly learning the latest techniques and staying up-to-date on technology.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            {TECH.map(t => (
              <div key={t.title} className="p-5 rounded bg-white/10 border border-white/10">
                <h3 className="font-semibold mb-1.5">{t.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href={`${BASE}/services`}
              className="inline-block px-6 py-2.5 bg-white text-[#002b7f] font-semibold rounded text-sm hover:bg-gray-100 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-[#f8f9fb] py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-3">
              Why Mayo Dental
            </p>
            <h2 className="text-3xl font-bold text-[#002b7f] mb-4">Why Choose Us?</h2>
            <p className="text-[#494949] leading-relaxed mb-4">
              We are Edgewater dentists that pride ourselves on offering the highest standard of care.
            </p>
            <p className="text-[#494949] leading-relaxed mb-6">
              Our dentists are always professional, caring, and understand that dental work can make
              many people uncomfortable. The following things set us apart from other dentists:
            </p>
            <ul className="space-y-3">
              {WHY.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#252525]">
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href={`${BASE}/meet-the-team`}
              className="inline-block mt-7 px-6 py-2.5 bg-[#002b7f] text-white font-semibold rounded text-sm hover:bg-[#001d5c] transition-colors"
            >
              Meet the Doctors
            </Link>
          </div>
          <ImagePlaceholder label="Office Interior Photo" className="h-72" />
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-2">
            Patient Reviews
          </p>
          <h2 className="text-3xl font-bold text-[#002b7f] mb-10">What Our Patients Say</h2>

          <div
            className="p-8 rounded bg-[#f8f9fb] border border-[#e4e4e4] mb-6"
            style={{ minHeight: "170px" }}
          >
            <Stars />
            <p className="text-[#252525] text-base leading-relaxed mb-4 italic">
              &ldquo;{TESTIMONIALS[idx].text}&rdquo;
            </p>
            <p className="text-[#494949] text-sm font-semibold">{TESTIMONIALS[idx].author}</p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-8">
            <button
              onClick={prev}
              className="w-9 h-9 rounded-full border border-[#e4e4e4] flex items-center justify-center text-[#494949] hover:border-[#002b7f] hover:text-[#002b7f] transition-colors"
              aria-label="Previous"
            >
              &#8592;
            </button>
            <div className="flex gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-[#002b7f]" : "bg-[#e4e4e4]"}`}
                  aria-label={`Testimonial ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="w-9 h-9 rounded-full border border-[#e4e4e4] flex items-center justify-center text-[#494949] hover:border-[#002b7f] hover:text-[#002b7f] transition-colors"
              aria-label="Next"
            >
              &#8594;
            </button>
          </div>

          <a
            href="https://www.google.com/search?q=Mayo+Dental+Family+Dentistry+Edgewater+MD"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#002b7f] text-sm font-semibold hover:text-[#339e35] transition-colors"
          >
            Leave us a Google Review
          </a>
        </div>
      </section>

      {/* Location / Map */}
      <section className="bg-[#f8f9fb] py-16 px-4 border-t border-[#e4e4e4]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-2 text-center">
            Find Us
          </p>
          <h2 className="text-3xl font-bold text-[#002b7f] text-center mb-10">Our Location</h2>

          <div className="grid md:grid-cols-[1fr_360px] gap-8 items-start">
            {/* Map */}
            <OfficeMap className="h-80" />

            {/* Info */}
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-[#002b7f] mb-3 text-sm uppercase tracking-wide">Address</h3>
                <p className="text-[#252525]">55 Mayo Rd</p>
                <p className="text-[#252525]">Edgewater, MD 21037</p>
                <a
                  href="https://goo.gl/maps/z4zesrDyxL22"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm text-[#002b7f] font-semibold hover:text-[#339e35] transition-colors"
                >
                  Get Directions
                </a>
              </div>

              <div>
                <h3 className="font-bold text-[#002b7f] mb-3 text-sm uppercase tracking-wide">Phone</h3>
                <p className="text-[#252525] text-sm">
                  Scheduling:{" "}
                  <a href="tel:4109566626" className="text-[#002b7f] font-semibold">410-956-6626</a>
                </p>
                <p className="text-[#252525] text-sm mt-1">
                  New Patients:{" "}
                  <a href="tel:4109566636" className="text-[#002b7f] font-semibold">410-956-6636</a>
                </p>
              </div>

              <div>
                <h3 className="font-bold text-[#002b7f] mb-3 text-sm uppercase tracking-wide">Office Hours</h3>
                <div className="space-y-1.5">
                  {HOURS.map(({ day, hours }) => (
                    <div key={day} className="flex justify-between text-sm">
                      <span className="text-[#494949]">{day}</span>
                      <span className="text-[#252525] font-medium">{hours}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                href={`${BASE}/contact`}
                className="block text-center py-3 bg-[#339e35] text-white font-semibold rounded text-sm hover:bg-[#2a7a2c] transition-colors"
              >
                Schedule an Appointment
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact teaser */}
      <section className="bg-[#002b7f] text-white py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            Ready to schedule? We&apos;d love to see you.
          </h2>
          <p className="text-white/70 mb-6 leading-relaxed">
            If you are looking for an experienced and compassionate Edgewater dentist, contact us today or
            fill out our form to learn more about what we offer our patients. We also offer a free second opinion.
          </p>
          <Link
            href={`${BASE}/contact`}
            className="inline-block px-7 py-3 bg-[#339e35] text-white font-semibold rounded hover:bg-[#2a7a2c] transition-colors"
          >
            Contact Us
          </Link>
          <div className="mt-8 text-white/60 text-sm space-y-1">
            <p>Mon - Thu: 9:00 AM - 5:00 PM &nbsp;|&nbsp; Fri: 8:00 AM - 2:00 PM &nbsp;|&nbsp; Sat: 8:00 AM - 2:00 PM (alternating)</p>
          </div>
        </div>
      </section>
    </>
  );
}
