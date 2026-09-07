"use client";

import Link from "next/link";
import config from "@/lib/config";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const appName = config?.appName || "Synapcite";

  return (
    <footer className="w-full border-t border-divider/40 bg-bg-page py-6 text-center text-xs text-secondary-text mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          &copy; {currentYear} {appName}. All rights reserved.
        </div>
        <div className="flex gap-4">
          <Link href="/about" className="hover:text-primary-text transition-colors">
            About Us
          </Link>
          <span className="opacity-30">•</span>
          <Link href="/contact" className="hover:text-primary-text transition-colors">
            Contact Us
          </Link>
        </div>
      </div>
    </footer>
  );
}
