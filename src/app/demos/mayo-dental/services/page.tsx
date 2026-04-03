import Link from "next/link";

const BASE = "/demos/mayo-dental";

const SERVICES = [
  {
    title: "General and Preventive Dentistry",
    desc: "Prevention is the best medicine. This is especially true with oral health. We offer routine dental services and deep cleanings so you can keep your smile healthy and bright.",
    items: [
      "Dental cleanings",
      "Comprehensive exams",
      "Digital X-rays",
      "Oral cancer screenings",
      "Fillings",
      "Sealants",
      "Fluoride treatment",
    ],
  },
  {
    title: "Cosmetic Dentistry and Smile Makeovers",
    desc: "We all want our smiles to be bright and perfect. At Mayo Dental, we offer a variety of cosmetic dental procedures to improve your smile.",
    items: [
      "Teeth whitening",
      "Porcelain veneers",
      "Dental bonding",
      "Smile makeovers",
    ],
  },
  {
    title: "Restorative Dentistry",
    desc: "We provide a wide range of restorative services, from routine fillings to same-day crowns, bridgework, and the latest in dental implants.",
    items: [
      "Same-day crowns (CEREC)",
      "Dental implants",
      "Dentures, partials, and bridges",
      "Dental fillings and restorations",
      "Inlays and onlays",
    ],
  },
  {
    title: "Orthodontic Treatment",
    desc: "Straighter teeth without the hassle of traditional braces. ClearCorrect aligners are clear, removable, and fit your lifestyle.",
    items: [
      "ClearCorrect clear aligners",
      "Traditional orthodontics",
    ],
  },
  {
    title: "Emergency Dental Care",
    desc: "Do you have a fractured tooth or a severe toothache? Don't wait until it's too late. Let us take care of your emergency dental needs with same-day appointments.",
    items: [
      "Toothaches",
      "Broken or chipped teeth",
      "Lost fillings or crowns",
      "Dental abscess",
      "Knocked-out teeth",
    ],
    emergency: true,
  },
  {
    title: "Oral Surgery and Endodontics",
    desc: "We offer root canal therapy and extractions of all adult and baby teeth, along with comprehensive periodontal care to keep your gums healthy.",
    items: [
      "Root canal therapy",
      "Tooth extractions",
      "Periodontal gum therapy",
      "Deep cleanings",
    ],
  },
];

function BulletDot() {
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-[#339e35] shrink-0 mt-1.5 inline-block" />
  );
}

export default function ServicesPage() {
  return (
    <>
      {/* Page header */}
      <section className="bg-[#002b7f] text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-3">Dental Procedures in Edgewater</h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto leading-relaxed">
            We Offer Services for the Whole Family
          </p>
        </div>
      </section>

      {/* Intro */}
      <section className="bg-[#f8f9fb] border-b border-[#e4e4e4] py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#494949] leading-relaxed text-base">
            You need a dentist you can trust and who can care for your whole family, even as it changes
            throughout the years. At Mayo Dental, we are committed to providing the highest standard of
            care for our patients. We provide a wide range of dental services, from routine cleanings to
            crowns, bridgework, dentures, oral surgery, and the latest in dental implants. If you
            experience harsh symptoms, we can accommodate you the same day.
          </p>
        </div>
      </section>

      {/* Service sections */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        {SERVICES.map((svc, i) => (
          <div key={svc.title}>
            <div className="py-10">
              <h2 className="text-2xl font-bold text-[#002b7f] mb-3">{svc.title}</h2>
              <p className="text-[#494949] leading-relaxed mb-5">{svc.desc}</p>

              {svc.emergency && (
                <div className="mb-5 p-4 rounded bg-red-50 border border-red-200">
                  <p className="font-semibold text-red-700 text-sm mb-1">
                    In a dental emergency, call us now:
                  </p>
                  <a href="tel:4109566626" className="text-red-700 font-bold text-2xl">
                    410-956-6626
                  </a>
                </div>
              )}

              <ul className="space-y-2">
                {svc.items.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[#252525]">
                    <BulletDot />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {i < SERVICES.length - 1 && <div className="border-b border-[#e4e4e4]" />}
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="bg-[#002b7f] text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            Get that perfect smile you&apos;ve always wanted.
          </h2>
          <p className="text-white/70 mb-6 leading-relaxed">
            Whether you need general dental care or cosmetic services, our dentists can assist you.
            Call today to schedule an appointment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="tel:4109566626"
              className="px-6 py-3 bg-white text-[#002b7f] font-semibold rounded hover:bg-gray-100 transition-colors"
            >
              Call 410-956-6626
            </a>
            <Link
              href={`${BASE}/contact`}
              className="px-6 py-3 bg-[#339e35] text-white font-semibold rounded hover:bg-[#2a7a2c] transition-colors"
            >
              Request an Appointment
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
