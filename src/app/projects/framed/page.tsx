import Link from 'next/link';

export default function FramedPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-10 inline-block"
      >
        &larr; Back to projects
      </Link>
      <h1 className="text-3xl font-semibold text-darkblue tracking-tight mb-4">Framed</h1>
      <p className="text-brown-light leading-relaxed">
        Still working on documentation for this project! Full write-up and drawings coming soon.
      </p>
    </div>
  );
}
