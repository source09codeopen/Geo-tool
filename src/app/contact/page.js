import Link from "next/link";
import Footer from "@/components/Footer";
import { FaEnvelope } from "react-icons/fa";

export default function Contact() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-page select-none text-primary-text overflow-hidden">
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 sm:px-6 lg:px-8 flex flex-col gap-6 overflow-y-auto scrollbar-subtle items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">
            Contact Us
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">
          Get In Touch
        </h1>
        <p className="text-sm text-secondary-text max-w-md leading-relaxed">
          Questions, feedback, or partnership ideas — we'd love to hear from you.
        </p>

        <a
          href="mailto:hello@synapcite.com"
          className="flex items-center gap-2.5 bg-bg-card/40 border border-divider/50 rounded-2xl px-6 py-4 text-sm font-bold text-primary-text hover:border-primary transition-all"
        >
          <FaEnvelope className="text-primary" />
          hello@synapcite.com
        </a>

        <Link
          href="/"
          className="text-xs font-semibold text-secondary-text hover:text-primary-text transition-colors mt-2"
        >
          ← Back to Workspace
        </Link>
      </main>

      <Footer />
    </div>
  );
}
