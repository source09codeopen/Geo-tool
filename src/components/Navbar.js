"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { IoClose, IoMenu } from "react-icons/io5";
import { SiVercel } from "react-icons/si";
import config from "@/lib/config";

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const appName = config?.appName || "AI SaaS";
  const logoLetter = appName.trim().charAt(0).toUpperCase();

  const navLinks = [
    { name: "Workspace", path: "/" },
    { name: "Pricing", path: "/pricing" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-divider/50 shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">

        {/* Logo and Brand Title */}
        <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-[1.02] active:scale-95">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-extrabold text-lg shadow-md shadow-primary/30">
            {logoLetter}
          </div>
          <span className="text-lg font-black tracking-tight text-primary-text text-nowrap">
            {appName}
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.name}
                href={link.path}
                className={`text-[13px] font-semibold transition-all relative py-1 ${
                  isActive ? "text-primary" : "text-secondary-text hover:text-primary-text"
                }`}
              >
                {link.name}
                {isActive && (
                  <div className="absolute -bottom-[20px] left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions Section */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSamurAIGPT%2Fcommon-saas-template"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-divider px-4 py-1.5 text-xs font-bold text-secondary-text hover:text-primary-text hover:bg-bg-card transition-colors shadow-sm"
          >
            <SiVercel className="text-xs text-white" />
            <span>Deploy</span>
          </a>
        </div>

        {/* Mobile Navbar Controls */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="hover:bg-bg-card p-2 rounded cursor-pointer transition-colors text-primary-text border border-divider/50"
            aria-label="Toggle Menu"
          >
            {isOpen ? <IoClose size={20} /> : <IoMenu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[200] glass-dropdown border-b border-divider shadow-2xl py-4 px-6 md:hidden animate-fade-in">
          <nav className="flex flex-col gap-3">
            <span className="text-[10px] uppercase font-bold text-secondary-text tracking-widest mb-1">Navigation</span>
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center py-2.5 rounded text-sm font-semibold transition-all ${
                  pathname === link.path ? "bg-primary/10 text-primary px-3 border border-primary/20" : "text-primary-text hover:bg-bg-card"
                }`}
              >
                {link.name}
              </Link>
            ))}

            <div className="h-px bg-divider/50 my-2" />

            <a
              href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSamurAIGPT%2Fcommon-saas-template"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-divider py-3 text-xs font-bold text-secondary-text hover:text-primary-text hover:bg-bg-card transition-all"
            >
              <SiVercel className="text-xs text-white" />
              <span>Clone & Deploy Template</span>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
