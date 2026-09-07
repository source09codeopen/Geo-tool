"use client";

import Link from "next/link";
import Footer from "@/components/Footer";
import { FaCheck, FaInfoCircle } from "react-icons/fa";

export default function Pricing() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-page select-none text-primary-text overflow-hidden">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 sm:px-6 lg:px-8 flex flex-col gap-8 overflow-y-auto scrollbar-subtle items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
          <FaInfoCircle className="text-primary text-xs" />
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">
            Pricing
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">
          Free, No Sign-Up Required
        </h1>
        <p className="text-sm text-secondary-text max-w-lg leading-relaxed">
          Every AI Visibility Audit — full-site scan, per-page breakdown, copy-paste-ready
          fixes, and the branded PDF export — is available to anyone, at no cost.
        </p>

        <ul className="space-y-3 text-sm font-semibold text-secondary-text text-left bg-bg-card/40 border border-divider/50 rounded-2xl p-6">
          <li className="flex items-center gap-2.5">
            <FaCheck className="text-primary text-xs flex-shrink-0" />
            <span>Unlimited AI visibility audits</span>
          </li>
          <li className="flex items-center gap-2.5">
            <FaCheck className="text-primary text-xs flex-shrink-0" />
            <span>Full-site scan (up to 10 pages)</span>
          </li>
          <li className="flex items-center gap-2.5">
            <FaCheck className="text-primary text-xs flex-shrink-0" />
            <span>Copy-paste-ready fixes and PDF export</span>
          </li>
        </ul>

        <Link
          href="/"
          className="bg-primary hover:bg-primary-hover text-white px-8 py-3.5 rounded-full text-sm font-bold transition-all shadow-lg shadow-primary/20"
        >
          Run an Audit
        </Link>
      </main>

      <Footer />
    </div>
  );
}
