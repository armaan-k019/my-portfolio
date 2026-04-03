import Link from "next/link";

const BASE = "/demos/mayo-dental";

function PersonPlaceholderLg() {
  return (
    <div
      className="h-80 rounded border-2 border-dashed border-[#002b7f]/20 flex flex-col items-center justify-center gap-3"
      style={{ backgroundColor: "rgba(0,43,127,0.04)" }}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="32" fill="#002b7f" fillOpacity="0.1" />
        <circle cx="32" cy="24" r="11" fill="#002b7f" fillOpacity="0.3" />
        <path d="M8 58c0-13.3 10.7-24 24-24s24 10.7 24 24" fill="#002b7f" fillOpacity="0.18" />
      </svg>
      <span className="text-[#002b7f]/50 text-xs font-medium">Photo Placeholder</span>
    </div>
  );
}

function PersonPlaceholderSm() {
  return (
    <div
      className="w-20 h-20 rounded-full border-2 border-dashed border-[#002b7f]/20 flex items-center justify-center mx-auto mb-4 shrink-0"
      style={{ backgroundColor: "rgba(0,43,127,0.05)" }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="14" r="6" fill="#002b7f" fillOpacity="0.3" />
        <path d="M4 34c0-7.7 6.3-14 14-14s14 6.3 14 14" fill="#002b7f" fillOpacity="0.18" />
      </svg>
    </div>
  );
}

const STAFF = [
  { name: "Tracy",       role: "Dental Hygienist" },
  { name: "Team Member", role: "Dental Assistant" },
  { name: "Team Member", role: "Front Office" },
];

export default function MeetTheTeamPage() {
  return (
    <>
      {/* Page header */}
      <section className="bg-[#002b7f] text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-3">Meet the Doctors</h1>
          <p className="text-white/80 text-lg">
            Get to know the friendly faces behind your care.
          </p>
        </div>
      </section>

      {/* Doctor */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <PersonPlaceholderLg />
          <div>
            <p className="text-[#339e35] text-xs font-bold uppercase tracking-widest mb-2">
              Meet the Doctor
            </p>
            <h2 className="text-3xl font-bold text-[#002b7f] mb-1">Dr. Keer</h2>
            <p className="text-[#494949] text-sm font-medium mb-5">
              General and Cosmetic Dentist, Founder
            </p>
            <p className="text-[#494949] leading-relaxed mb-4">
              Dr. Keer has been serving the Edgewater community for over 10 years with a commitment
              to gentle, compassionate care. Her patients consistently describe her as thorough, kind,
              and exceptionally skilled, especially with patients who experience dental anxiety.
            </p>
            <p className="text-[#494949] leading-relaxed">
              She and her team have built a practice where every patient feels welcomed, respected,
              and well cared for. Dr. Keer continues to stay up to date with the latest advances in
              dental care to bring the best possible treatment to her patients.
            </p>
          </div>
        </div>
      </section>

      {/* Staff */}
      <section className="bg-[#f8f9fb] py-16 px-4 border-t border-[#e4e4e4]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[#002b7f] mb-3">Our Staff</h2>
          <p className="text-[#494949] leading-relaxed mb-10 max-w-2xl">
            Our front office and clinical team are dedicated to making your experience as smooth and
            comfortable as possible, from scheduling your appointment to walking you through your
            treatment options.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {STAFF.map((member, i) => (
              <div key={i} className="bg-white rounded border border-[#e4e4e4] p-6 text-center">
                <PersonPlaceholderSm />
                <h3 className="font-semibold text-[#252525] mb-1">{member.name}</h3>
                <p className="text-sm text-[#494949]">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comfort callout */}
      <section className="bg-[#002b7f] text-white py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">We Understand Dental Anxiety</h2>
          <p className="text-white/80 leading-relaxed mb-6">
            We know dental visits can feel stressful. Our team is trained to work with anxious
            patients. Take your time, ask questions, and know that you are always in good hands.
          </p>
          <Link
            href={`${BASE}/contact`}
            className="inline-block px-6 py-3 bg-[#339e35] text-white font-semibold rounded hover:bg-[#2a7a2c] transition-colors"
          >
            Schedule a Visit
          </Link>
        </div>
      </section>
    </>
  );
}
