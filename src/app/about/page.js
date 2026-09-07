import Link from "next/link";
import Footer from "@/components/Footer";
import { FaBullseye, FaRobot, FaChartLine } from "react-icons/fa";

export default function About() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-page select-none text-primary-text overflow-hidden">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 sm:px-6 lg:px-8 flex flex-col gap-8 overflow-y-auto scrollbar-subtle items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">
            About Us
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">
          Built for the AI Search Era
        </h1>
        <p className="text-sm text-secondary-text max-w-lg leading-relaxed">
          Search is changing — people ask ChatGPT, Perplexity, Gemini, and
          Claude instead of typing into a search box. Synapcite exists to
          answer one question for every website owner: is your content even
          reachable by the models answering those questions?
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full text-left">
          <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-5 space-y-2">
            <FaBullseye className="text-primary" />
            <h3 className="text-sm font-bold text-primary-text">Our Mission</h3>
            <p className="text-xs text-secondary-text leading-relaxed">
              Make AI search visibility measurable and fixable, not guesswork.
            </p>
          </div>
          <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-5 space-y-2">
            <FaRobot className="text-primary" />
            <h3 className="text-sm font-bold text-primary-text">How It Works</h3>
            <p className="text-xs text-secondary-text leading-relaxed">
              We scan your site the way AI crawlers do, then hand you exact,
              copy-paste fixes.
            </p>
          </div>
          <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-5 space-y-2">
            <FaChartLine className="text-primary" />
            <h3 className="text-sm font-bold text-primary-text">Who It's For</h3>
            <p className="text-xs text-secondary-text leading-relaxed">
              Marketers, SEO agencies, and developers who want to win citations,
              not just rankings.
            </p>
          </div>
        </div>

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
