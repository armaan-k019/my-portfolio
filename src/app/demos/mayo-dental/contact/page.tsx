"use client";

import { useState } from "react";
import OfficeMap from "../_components/OfficeMap";

const HOURS = [
  { day: "Monday",    hours: "9:00 AM - 5:00 PM" },
  { day: "Tuesday",   hours: "9:00 AM - 5:00 PM" },
  { day: "Wednesday", hours: "9:00 AM - 5:00 PM" },
  { day: "Thursday",  hours: "9:00 AM - 5:00 PM" },
  { day: "Friday",    hours: "8:00 AM - 2:00 PM" },
  { day: "Saturday",  hours: "8:00 AM - 2:00 PM (alternating)" },
];

interface FormState {
  firstName:    string;
  lastName:     string;
  phone:        string;
  email:        string;
  preferredDay: string;
  preferredTime:string;
  patientType:  string;
  reason:       string;
  notes:        string;
}

const EMPTY: FormState = {
  firstName: "", lastName: "", phone: "", email: "",
  preferredDay: "", preferredTime: "", patientType: "new", reason: "", notes: "",
};

const field =
  "w-full px-3 py-2.5 rounded border border-[#e4e4e4] text-sm text-[#252525] bg-white focus:outline-none focus:border-[#002b7f] transition-colors placeholder:text-[#9CA3AF]";

export default function ContactPage() {
  const [form, setForm]           = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <>
      {/* Page header */}
      <section className="bg-[#002b7f] text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-3">Contact Us</h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto leading-relaxed">
            If you are looking for an experienced and compassionate Edgewater dentist, contact us
            today at{" "}
            <a href="tel:4109566626" className="font-bold text-white underline">
              410-956-6626
            </a>{" "}
            or fill out the form below to learn more about what we offer.
          </p>
        </div>
      </section>

      {/* Two-column */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-start">

          {/* Form */}
          <div className="bg-white rounded border border-[#e4e4e4] p-6 sm:p-8">
            <h2 className="text-xl font-bold text-[#002b7f] mb-6">Schedule an Appointment</h2>

            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-[#339e35]/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#339e35" fillOpacity="0.15" />
                    <path d="M9 16l5 5 9-9" stroke="#339e35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-[#252525] mb-2">Request Received!</h3>
                <p className="text-[#494949] leading-relaxed max-w-sm mx-auto">
                  Thank you! We will give you a call within 1 business day to confirm your appointment.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">First Name</label>
                    <input type="text" name="firstName" required value={form.firstName} onChange={handleChange} className={field} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">Last Name</label>
                    <input type="text" name="lastName" required value={form.lastName} onChange={handleChange} className={field} />
                  </div>
                </div>

                {/* Phone + Email */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">Phone Number</label>
                    <input type="tel" name="phone" required value={form.phone} onChange={handleChange} className={field} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">
                      Email <span className="text-[#494949] font-normal">(optional)</span>
                    </label>
                    <input type="email" name="email" value={form.email} onChange={handleChange} className={field} />
                  </div>
                </div>

                {/* Day + Time */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">Preferred Day</label>
                    <select name="preferredDay" value={form.preferredDay} onChange={handleChange} className={field}>
                      <option value="">Select...</option>
                      <option>Monday - Thursday</option>
                      <option>Friday</option>
                      <option>Saturday (alternating)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#252525] mb-1.5">Preferred Time</label>
                    <select name="preferredTime" value={form.preferredTime} onChange={handleChange} className={field}>
                      <option value="">Select...</option>
                      <option>Morning (9 AM - 12 PM)</option>
                      <option>Afternoon (12 PM - 5 PM)</option>
                    </select>
                  </div>
                </div>

                {/* Patient type */}
                <div>
                  <label className="block text-sm font-semibold text-[#252525] mb-2.5">Patient Type</label>
                  <div className="flex gap-6">
                    {[
                      { value: "new",      label: "New Patient" },
                      { value: "existing", label: "Existing Patient" },
                    ].map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-[#252525]">
                        <input
                          type="radio"
                          name="patientType"
                          value={opt.value}
                          checked={form.patientType === opt.value}
                          onChange={handleChange}
                          className="accent-[#002b7f]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-semibold text-[#252525] mb-1.5">Reason for Visit</label>
                  <select name="reason" required value={form.reason} onChange={handleChange} className={field}>
                    <option value="">Select...</option>
                    <option>Cleaning / Exam</option>
                    <option>Cosmetic Consultation</option>
                    <option>Emergency</option>
                    <option>Orthodontics</option>
                    <option>Other</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold text-[#252525] mb-1.5">
                    Additional Notes <span className="text-[#494949] font-normal">(optional)</span>
                  </label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Any additional details, concerns, or questions..."
                    className={`${field} resize-none`}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded bg-[#339e35] text-white font-bold text-sm hover:bg-[#2a7a2c] transition-colors"
                >
                  Request a Callback
                </button>

                <p className="text-xs text-[#494949] text-center leading-relaxed">
                  We do not have online scheduling. Our team will contact you directly to confirm your visit.
                  We also offer a free second opinion.
                </p>
              </form>
            )}
          </div>

          {/* Office info */}
          <div className="space-y-5">
            <div className="bg-white rounded border border-[#e4e4e4] p-6">
              <h2 className="font-bold text-[#002b7f] mb-4">Office Information</h2>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2.5 items-start">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="#002b7f" className="shrink-0 mt-0.5">
                    <path d="M8 0C5.24 0 3 2.24 3 5c0 3.75 5 11 5 11s5-7.25 5-11c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"/>
                  </svg>
                  <span className="text-[#252525]">55 Mayo Rd, Edgewater, MD 21037</span>
                </div>
                <div className="flex gap-2.5 items-start">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="#002b7f" className="shrink-0 mt-0.5">
                    <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015L10.474 5.57a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L4.482 4.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
                  </svg>
                  <div>
                    <p className="text-[#252525]">
                      New Patients:{" "}
                      <a href="tel:4109566636" className="text-[#002b7f] font-semibold">410-956-6636</a>
                    </p>
                    <p className="text-[#252525] mt-0.5">
                      Scheduling:{" "}
                      <a href="tel:4109566626" className="text-[#002b7f] font-semibold">410-956-6626</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours */}
            <div className="bg-white rounded border border-[#e4e4e4] p-6">
              <h2 className="font-bold text-[#002b7f] mb-4">Office Hours</h2>
              <div className="space-y-2">
                {HOURS.map(({ day, hours }) => (
                  <div key={day} className="flex justify-between text-sm">
                    <span className="text-[#494949]">{day}</span>
                    <span className="text-[#252525] font-medium text-right">{hours}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map */}
            <OfficeMap className="h-52" />
            <a
              href="https://goo.gl/maps/z4zesrDyxL22"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-[#002b7f] font-semibold hover:text-[#339e35] transition-colors"
            >
              Get Directions
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
