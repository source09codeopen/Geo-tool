"use client";

import { useState, useEffect, useRef } from "react";
import {
  FaSearch,
  FaSpinner,
  FaGlobe,
  FaCheckCircle,
  FaExclamationTriangle,
  FaRobot,
  FaDatabase,
  FaLink,
  FaDownload,
  FaUndo,
  FaCopy,
  FaCheck,
  FaFilePdf,
  FaCode,
  FaBolt,
  FaChartBar,
  FaBrain,
  FaKey,
  FaSync,
  FaImage,
  FaHeading,
  FaTags,
  FaListOl,
  FaLayerGroup,
  FaMicrochip,
} from "react-icons/fa";
import clsx from "clsx";

const ENGINES = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "perplexity", name: "Perplexity" },
  { id: "google", name: "Google AI Overviews" },
  { id: "gemini", name: "Gemini Pro" },
  { id: "claude", name: "Claude" },
];

export default function StudioPage() {
  // Inputs
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [engines, setEngines] = useState(["chatgpt", "perplexity", "google", "gemini", "claude"]);

  // States
  const [result, setResult] = useState(null);
  const [generatingStatus, setGeneratingStatus] = useState(""); // "", "generating", "success", "error"
  const [generatingError, setGeneratingError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Report branding (for client-facing PDF export)
  const [brandName, setBrandName] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);

  // Real, re-checkable AI crawler permission status
  const [crawlerStatus, setCrawlerStatus] = useState([]);
  const [recheckingCrawlers, setRecheckingCrawlers] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("geo_report_brand_name");
    if (saved) setBrandName(saved);
  }, []);

  useEffect(() => {
    setCrawlerStatus(result?.crawler_status || []);
  }, [result]);

  const handleBrandNameChange = (value) => {
    setBrandName(value);
    window.localStorage.setItem("geo_report_brand_name", value);
  };

  const handleCopyCode = async (code, key) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error("Failed to copy code:", e);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleRecheckCrawlers = async () => {
    if (!url) return;
    setRecheckingCrawlers(true);
    try {
      const res = await fetch("/api/recheck-crawlers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        setCrawlerStatus(data.crawler_status || []);
      }
    } catch (e) {
      console.error("Failed to re-test crawlers:", e);
    } finally {
      setRecheckingCrawlers(false);
    }
  };

  const scoreBadgeClass = (score) => {
    if (score >= 70) return "bg-emerald-950/30 text-emerald-400 border-emerald-900/40";
    if (score >= 40) return "bg-amber-950/30 text-amber-400 border-amber-800/40";
    return "bg-red-950/30 text-red-400 border-red-900/40";
  };

  const crawlerBadgeClass = (status) => {
    if (status === "Allowed") return "bg-emerald-950/30 text-emerald-400 border-emerald-900/40";
    if (status === "Blocked") return "bg-red-950/30 text-red-400 border-red-900/40";
    return "bg-amber-950/30 text-amber-400 border-amber-800/40";
  };

  // Progress Loader text simulator
  const [loaderIndex, setLoaderIndex] = useState(0);
  const timerIntervalRef = useRef(null);
  const loaderIntervalRef = useRef(null);

  const loaderTexts = [
    "Scraping homepage + crawling site pages...",
    "Running deterministic on-page SEO analysis...",
    "Gemini Flash: parsing heavy DOM & drafting llms.txt...",
    "Qwen 3: generating clean JSON-LD & localized schema...",
    "Groq / Llama: writing titles & alt tags in real time...",
    "Scoring E-E-A-T & citation likelihood across engines...",
    "Merging multi-model results into your report...",
  ];

  // Active Timer hooks
  useEffect(() => {
    if (generatingStatus === "generating") {
      setElapsedSeconds(0);
      setLoaderIndex(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      loaderIntervalRef.current = setInterval(() => {
        setLoaderIndex((prev) => (prev + 1) % loaderTexts.length);
      }, 2200);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (loaderIntervalRef.current) clearInterval(loaderIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (loaderIntervalRef.current) clearInterval(loaderIntervalRef.current);
    };
  }, [generatingStatus]);

  const toggleEngine = (id) => {
    setEngines((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!url) {
      setGeneratingError("Please enter a website URL to audit.");
      setGeneratingStatus("error");
      return;
    }

    if (!keyword) {
      setGeneratingError("Please enter your target keyword niche.");
      setGeneratingStatus("error");
      return;
    }

    if (engines.length === 0) {
      setGeneratingError("Please select at least one AI search engine.");
      setGeneratingStatus("error");
      return;
    }

    setGeneratingStatus("generating");
    setGeneratingError("");
    setResult(null);

    const requestController = new AbortController();
    const requestTimeout = setTimeout(() => requestController.abort(), 65000);

    try {
      const res = await fetch("/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          keyword,
          engines,
        }),
        signal: requestController.signal,
      });
      clearTimeout(requestTimeout);

      // 429 = per-IP throttle or upstream AI busy — show the server's message.
      if (res.status === 429) {
        const info = await res.json().catch(() => ({}));
        setGeneratingError(
          info.message ||
            "The audit service is busy right now. Please try again in a minute.",
        );
        setGeneratingStatus("error");
        return;
      }

      if (!res.ok) throw new Error("Visibility audit request failed");
      const data = await res.json();

      if (data.status === "completed" && data.reportData) {
        try {
          const parsedReport = JSON.parse(data.reportData);
          setResult(parsedReport);
          setGeneratingStatus("success");
        } catch (e) {
          console.error("Failed to parse report data:", e);
          setGeneratingError(
            "AI visibility check report could not be parsed. Please try again.",
          );
          setGeneratingStatus("error");
        }
      } else {
        setGeneratingError(
          "AI visibility check failed. Please verify your website link and try again.",
        );
        setGeneratingStatus("error");
      }
    } catch (err) {
      clearTimeout(requestTimeout);
      console.error(err);
      setGeneratingError(
        err.name === "AbortError"
          ? "The audit request timed out. Please try again."
          : "An error occurred during generative engine audit. Please try again.",
      );
      setGeneratingStatus("error");
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const downloadUrl = `/api/download?url=${encodeURIComponent(
      `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`,
    )}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `geo_audit_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset page to initial portal view
  const handleReset = () => {
    setResult(null);
    setGeneratingStatus("");
    setGeneratingError("");
  };

  const getButtonContent = () => {
    if (generatingStatus === "generating") {
      return {
        text: `Analyzing... (${elapsedSeconds}s)`,
        className:
          "w-full bg-bg-card border border-divider text-secondary-text rounded py-3.5 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-not-allowed opacity-60",
        icon: (
          <FaSpinner className="animate-spin text-xs text-secondary-text" />
        ),
        disabled: true,
      };
    }

    if (!url && !keyword) {
      return {
        text: "Enter URL & Keyword to Begin",
        className:
          "w-full bg-bg-card hover:bg-bg-card-hover text-primary-text border border-divider rounded py-3.5 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]",
        icon: <FaGlobe className="text-xs text-secondary-text" />,
        disabled: false,
      };
    }

    if (!url) {
      return {
        text: "Enter Website URL",
        className:
          "w-full bg-bg-card hover:bg-bg-card-hover text-primary-text border border-divider rounded py-3.5 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]",
        icon: <FaGlobe className="text-xs text-secondary-text" />,
        disabled: false,
      };
    }

    if (!keyword) {
      return {
        text: "Enter Search Keyword",
        className:
          "w-full bg-bg-card hover:bg-bg-card-hover text-primary-text border border-divider rounded py-3.5 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]",
        icon: <FaSearch className="text-xs text-secondary-text" />,
        disabled: false,
      };
    }

    return {
      text: "Run GEO Audit",
      className:
        "w-full bg-primary hover:bg-primary-hover text-white rounded py-3.5 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-primary/20 active:scale-[0.99]",
      icon: <FaBolt className="text-xs text-white animate-pulse" />,
      disabled: false,
    };
  };

  const btn = getButtonContent();

  return (
    <div className="flex-1 bg-bg-page text-primary-text font-sans overflow-y-auto relative selection:bg-primary/30">
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 🔮 STATE A: INITIAL SEARCH PORTAL */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {generatingStatus !== "generating" && !result && (
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24 relative z-10 flex flex-col items-center">
          {/* Hero Branding */}
          <div className="text-center space-y-4 max-w-2xl mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
              Generative Engine Optimization
            </div>
            <h1 className="text-4xl sm:text-5xl font-black font-heading text-primary-text tracking-tight leading-none">
              Why Isn't Your Site{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-hover">
                Cited by AI Search?
              </span>
            </h1>
            <p className="text-sm sm:text-base text-secondary-text leading-relaxed font-medium">
              Audit citation indexing, crawler blocks, and model embeddings in
              seconds.
            </p>
          </div>

          {/* Centered Search-Console Card */}
          <div className="w-full bg-bg-card/50 border border-divider/50 rounded p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-6">
            {/* Split Input Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* URL Field */}
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FaLink className="text-primary text-[9px]" /> Website URL to
                  Audit
                </label>
                <div
                  className={clsx(
                    "relative flex items-center bg-bg-page/80 border rounded transition-all duration-200",
                    generatingStatus === "error" &&
                      !url &&
                      generatingError.toLowerCase().includes("url")
                      ? "border-red-500/80 bg-red-950/10 shadow-lg shadow-red-950/20 animate-pulse"
                      : "border-divider/50 hover:border-divider focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/35",
                  )}
                >
                  <span className="text-xs text-secondary-text pl-4 select-none font-bold">
                    https://
                  </span>
                  <input
                    type="text"
                    placeholder="example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs font-semibold py-4 pl-1 pr-4 text-primary-text placeholder-secondary-text/40 focus:outline-none focus:ring-0"
                  />
                </div>
                {generatingStatus === "error" &&
                  !url &&
                  generatingError.toLowerCase().includes("url") && (
                    <div className="text-[10px] text-red-400 font-bold mt-2 flex items-center gap-1">
                      <FaExclamationTriangle className="text-red-500 text-[9px]" />{" "}
                      {generatingError}
                    </div>
                  )}
              </div>

              {/* Keyword Field */}
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FaSearch className="text-primary text-[9px]" /> Target
                  Search Query / Niche
                </label>
                <div
                  className={clsx(
                    "relative flex items-center bg-bg-page/80 border rounded transition-all duration-200",
                    generatingStatus === "error" &&
                      !keyword &&
                      generatingError.toLowerCase().includes("keyword")
                      ? "border-red-500/80 bg-red-950/10 shadow-lg shadow-red-950/20 animate-pulse"
                      : "border-divider/50 hover:border-divider focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/35",
                  )}
                >
                  <input
                    type="text"
                    placeholder="e.g., best task manager for engineering startups"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs font-semibold py-4 px-4 text-primary-text placeholder-secondary-text/40 focus:outline-none focus:ring-0"
                  />
                </div>
                {generatingStatus === "error" &&
                  !keyword &&
                  generatingError.toLowerCase().includes("keyword") && (
                    <div className="text-[10px] text-red-400 font-bold mt-2 flex items-center gap-1">
                      <FaExclamationTriangle className="text-red-500 text-[9px]" />{" "}
                      {generatingError}
                    </div>
                  )}
              </div>
            </div>

            {/* AI Search Engines Selection */}
            <div className="flex flex-wrap items-center gap-2.5 border-t border-divider/50 pt-4">
              <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider mr-1">
                Target AI Engines:
              </span>
              {ENGINES.map((eng) => {
                const checked = engines.includes(eng.id);
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => toggleEngine(eng.id)}
                    className={clsx(
                      "px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      checked
                        ? "bg-primary/10 border-primary text-primary-text"
                        : "bg-bg-page/80 border-divider/50 text-secondary-text hover:bg-bg-card-hover hover:text-primary-text",
                    )}
                  >
                    {checked && <FaCheck className="text-primary text-[9px]" />}
                    <span>{eng.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Launch Action triggers */}
            <div className="border-t border-divider/50 pt-6 flex flex-col sm:flex-row items-center justify-end gap-4">
              {/* Central Trigger Button */}
              <button
                onClick={handleGenerate}
                disabled={btn.disabled}
                className={clsx(
                  btn.className,
                  "w-full sm:w-auto sm:px-8 py-4 rounded shadow-xl hover:scale-[1.01] active:scale-[0.99] font-extrabold text-sm",
                )}
              >
                {btn.icon}
                <span>{btn.text}</span>
              </button>
            </div>

            {/* Non-form general error alert console */}
            {generatingStatus === "error" &&
              !(
                generatingError.toLowerCase().includes("url") ||
                generatingError.toLowerCase().includes("keyword")
              ) && (
                <div className="text-[11px] text-red-400 bg-red-950/40 border border-red-900/40 rounded p-4 flex items-start gap-2.5 shadow-inner mt-4 animate-in fade-in duration-200">
                  <FaExclamationTriangle className="text-red-500 flex-shrink-0 mt-0.5 text-xs animate-pulse" />
                  <span>{generatingError}</span>
                </div>
              )}
          </div>

          {/* What Synapcite Diagnoses For You */}
          <div className="w-full mt-16 space-y-8">
            <h2 className="text-center text-xs font-bold text-secondary-text uppercase tracking-[0.2em]">
              What Synapcite Diagnoses For You
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Card 1: AI Crawler Status */}
              <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-primary-text font-bold text-sm">
                  <FaRobot className="text-primary" />
                  <span>AI Crawler Status</span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-secondary-text">
                    <span>GPTBot</span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 text-[10px] font-bold">
                      <FaCheckCircle className="text-[9px]" /> Allowed
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold text-secondary-text">
                    <span>PerplexityBot</span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/30 text-red-400 border border-red-900/40 text-[10px] font-bold">
                      <FaExclamationTriangle className="text-[9px]" /> Blocked
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Citation Share vs Competitors */}
              <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-primary-text font-bold text-sm">
                  <FaChartBar className="text-primary" />
                  <span>Citation Share vs Competitors</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-secondary-text uppercase">
                      <span>Your Site</span>
                      <span>24%</span>
                    </div>
                    <div className="h-2 w-full bg-bg-page rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: "24%" }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-secondary-text uppercase">
                      <span>Competitor A</span>
                      <span>68%</span>
                    </div>
                    <div className="h-2 w-full bg-bg-page rounded-full overflow-hidden">
                      <div className="h-full bg-red-500/70 rounded-full" style={{ width: "68%" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Schema & Context Embeddings */}
              <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-primary-text font-bold text-sm">
                  <FaBrain className="text-primary" />
                  <span>Schema & Context Embeddings</span>
                </div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-xs text-secondary-text font-medium">
                    <FaExclamationTriangle className="text-amber-400 text-[10px] flex-shrink-0 mt-0.5" />
                    <span>Missing JSON-LD entity graph</span>
                  </li>
                  <li className="flex items-start gap-2 text-xs text-secondary-text font-medium">
                    <FaExclamationTriangle className="text-amber-400 text-[10px] flex-shrink-0 mt-0.5" />
                    <span>Unstructured tabular data</span>
                  </li>
                </ul>
              </div>

              {/* Card 4: Missed AI Prompts */}
              <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-primary-text font-bold text-sm">
                  <FaKey className="text-primary" />
                  <span>Missed AI Prompts</span>
                </div>
                <p className="text-xs text-secondary-text font-medium leading-relaxed">
                  <span className="text-primary-text font-black text-lg">12 queries</span>{" "}
                  where a rival is cited instead of you.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 🌀 STATE B: LOADING ANALYSIS WINDOW */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {generatingStatus === "generating" && (
        <div className="max-w-xl mx-auto px-4 py-24 sm:py-32 relative z-10 flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-full bg-bg-card/50 border border-divider/50 rounded p-8 backdrop-blur-md shadow-2xl flex flex-col items-center text-center space-y-6">
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-dashed border-primary animate-spin" />
              <FaGlobe className="absolute text-2xl text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-hover animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-heading font-black text-white">
                Running GEO Auditor Core...
              </h2>
              <p className="text-xs text-primary font-semibold tracking-wider uppercase animate-pulse">
                {loaderTexts[loaderIndex]}
              </p>
            </div>

            <div className="h-1.5 w-full bg-bg-page rounded-full overflow-hidden border border-divider/50">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min((elapsedSeconds / 15) * 100, 95)}%`,
                }}
              />
            </div>

            <p className="text-[10px] text-secondary-text leading-relaxed max-w-xs">
              Simulating crawling profiles and calculating keyword citation
              depth. Time elapsed:{" "}
              <span className="font-bold text-primary-text">
                {elapsedSeconds}s
              </span>
              . Max wait limit is 15s.
            </p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* 📈 STATE C: FULL-WIDTH RESULT DASHBOARD */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {generatingStatus === "success" && result && (
        <div id="report-printable" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8 animate-in fade-in duration-300">
          {/* Print-only branded header (hidden on screen) */}
          <div className="hidden print:block mb-6">
            <h1 className="text-2xl font-black">
              {brandName ? `${brandName} — AI Visibility Report` : "AI Visibility Report"}
            </h1>
            <p className="text-sm mt-1">
              {url} &middot; Target keyword: "{keyword}" &middot; Generated{" "}
              {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Dashboard Sticky Sub-Header Nav */}
          <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-bg-card/60 border border-divider/50 rounded-2xl p-5 backdrop-blur-md shadow-lg">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded uppercase">
                  GEO Report Output
                </span>
              </div>
              <h2 className="text-lg font-black text-primary-text mt-1.5 truncate flex items-center gap-1.5">
                <FaGlobe className="text-secondary-text text-sm" />
                <span>{url}</span>
              </h2>
              <p className="text-xs text-secondary-text mt-1 font-medium truncate">
                Target Search Query:{" "}
                <span className="text-primary-text">"{keyword}"</span>
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
              <input
                type="text"
                placeholder="Your agency/brand name (for PDF)"
                value={brandName}
                onChange={(e) => handleBrandNameChange(e.target.value)}
                className="bg-bg-page border border-divider/50 rounded px-3 py-2.5 text-xs text-primary-text placeholder-secondary-text/50 focus:outline-none focus:border-primary w-48"
              />
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-bg-page border border-divider/50 text-secondary-text hover:text-primary-text rounded text-xs font-bold transition-all cursor-pointer hover:bg-bg-card-hover"
              >
                <FaUndo className="text-[10px]" /> New Audit
              </button>
              <button
                onClick={handlePrintReport}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-bg-page border border-divider/50 text-secondary-text hover:text-primary-text rounded text-xs font-bold transition-all cursor-pointer hover:bg-bg-card-hover"
              >
                <FaFilePdf className="text-[10px]" /> Download PDF Report
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-bold transition-all cursor-pointer shadow-lg shadow-primary/20 hover:scale-[1.01]"
              >
                <FaDownload className="text-[10px]" /> Export JSON
              </button>
            </div>
          </div>

          {/* Top Row: Score Gauges Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Gauge 1: Main Visibility Score */}
            <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-divider/30"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-primary"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 -
                      (result.visibility_score / 100) * (2 * Math.PI * 46)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center justify-center z-10">
                  <span className="text-2xl font-black text-primary-text">
                    {result.visibility_score}%
                  </span>
                  <span className="text-[7px] font-bold text-secondary-text uppercase tracking-widest mt-0.5">
                    Visibility
                  </span>
                </div>
              </div>
              <h3 className="text-xs font-bold text-primary-text mt-4 uppercase tracking-wider">
                AI Search Visibility
              </h3>
              <p className="text-[9px] text-secondary-text mt-1 leading-relaxed">
                Overall citation coverage and recall index across engines
              </p>
            </div>

            {/* Gauge 2: E-E-A-T Quality */}
            <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-divider/30"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-primary"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 -
                      (result.eeat_score / 100) * (2 * Math.PI * 46)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center justify-center z-10">
                  <span className="text-2xl font-black text-primary-text">
                    {result.eeat_score}%
                  </span>
                  <span className="text-[7px] font-bold text-secondary-text uppercase tracking-widest mt-0.5">
                    E-E-A-T
                  </span>
                </div>
              </div>
              <h3 className="text-xs font-bold text-primary-text mt-4 uppercase tracking-wider">
                E-E-A-T Authority
              </h3>
              <p className="text-[9px] text-secondary-text mt-1 leading-relaxed">
                Expertise, authoritativeness, and trust signals profile
              </p>
            </div>

            {/* Gauge 3: Citation Likelihood */}
            <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-divider/30"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-primary"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 -
                      (result.citation_likelihood / 100) * (2 * Math.PI * 46)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center justify-center z-10">
                  <span className="text-2xl font-black text-primary-text">
                    {result.citation_likelihood}%
                  </span>
                  <span className="text-[7px] font-bold text-secondary-text uppercase tracking-widest mt-0.5">
                    Citation
                  </span>
                </div>
              </div>
              <h3 className="text-xs font-bold text-primary-text mt-4 uppercase tracking-wider">
                Citation Likelihood
              </h3>
              <p className="text-[9px] text-secondary-text mt-1 leading-relaxed">
                Probability of being referenced or quoted in answers
              </p>
            </div>

            {/* Gauge 4: Content Readability */}
            <div className="bg-bg-card/40 border border-divider/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative group overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-divider/30"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="stroke-primary"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 -
                      (result.readability_score / 100) * (2 * Math.PI * 46)
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center justify-center z-10">
                  <span className="text-2xl font-black text-primary-text">
                    {result.readability_score}%
                  </span>
                  <span className="text-[7px] font-bold text-secondary-text uppercase tracking-widest mt-0.5">
                    Readability
                  </span>
                </div>
              </div>
              <h3 className="text-xs font-bold text-primary-text mt-4 uppercase tracking-wider">
                Content Readability
              </h3>
              <p className="text-[9px] text-secondary-text mt-1 leading-relaxed">
                Syntax simplicity and semantic indexing index
              </p>
            </div>
          </div>

          {/* Multi-Model Pipeline Attribution Strip */}
          {result.pipeline?.length > 0 && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-5">
              <div className="flex items-center gap-1.5 border-b border-divider/50 pb-2.5 mb-4">
                <FaMicrochip className="text-primary text-[10px]" />
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Multi-Model Optimization Pipeline
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {result.pipeline.map((stage, idx) => {
                  const ok = stage.status === "completed";
                  const skipped = stage.status === "skipped";
                  return (
                    <div
                      key={idx}
                      className="bg-bg-page border border-divider/50 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                          {idx + 1}. {stage.stage}
                        </span>
                        <span
                          className={clsx(
                            "text-[9px] font-black px-2 py-0.5 rounded-full border",
                            ok
                              ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/40"
                              : skipped
                                ? "bg-amber-950/30 text-amber-400 border-amber-800/40"
                                : "bg-red-950/30 text-red-400 border-red-900/40",
                          )}
                        >
                          {ok ? "Done" : skipped ? "Skipped" : "Failed"}
                        </span>
                      </div>
                      <div className="text-xs font-black text-primary-text flex items-center gap-1.5">
                        <FaBrain className="text-primary text-[10px]" /> {stage.model}
                      </div>
                      <p className="text-[10px] text-secondary-text leading-relaxed">
                        {stage.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* On-Page SEO Suite (deterministic — measured, not AI-guessed) */}
          {result.onpage_seo && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-divider/50 pb-2.5">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider flex items-center gap-1.5">
                  <FaLayerGroup className="text-primary text-[9px]" /> On-Page SEO Suite
                </span>
                <span
                  className={clsx(
                    "text-[11px] font-black px-2.5 py-1 rounded-full border",
                    scoreBadgeClass(result.onpage_seo.score),
                  )}
                >
                  {result.onpage_seo.score}/100
                </span>
              </div>

              {/* Signal tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    icon: <FaHeading />,
                    label: "Title",
                    value: `${result.onpage_seo.meta?.title_length || 0} ch`,
                    good: result.onpage_seo.meta?.title_length >= 30 && result.onpage_seo.meta?.title_length <= 65,
                  },
                  {
                    icon: <FaTags />,
                    label: "Meta Desc",
                    value: `${result.onpage_seo.meta?.description_length || 0} ch`,
                    good: result.onpage_seo.meta?.description_length >= 70 && result.onpage_seo.meta?.description_length <= 165,
                  },
                  {
                    icon: <FaListOl />,
                    label: "H1 Tags",
                    value: result.onpage_seo.headings?.counts?.h1 ?? 0,
                    good: result.onpage_seo.headings?.counts?.h1 === 1,
                  },
                  {
                    icon: <FaImage />,
                    label: "Alt Coverage",
                    value: `${result.onpage_seo.images?.coverage_pct ?? 0}%`,
                    good: (result.onpage_seo.images?.coverage_pct ?? 0) >= 90,
                  },
                  {
                    icon: <FaCode />,
                    label: "JSON-LD",
                    value: result.onpage_seo.technical?.has_json_ld ? "Yes" : "No",
                    good: result.onpage_seo.technical?.has_json_ld,
                  },
                  {
                    icon: <FaBrain />,
                    label: "Readability",
                    value: result.onpage_seo.readability?.flesch_reading_ease ?? 0,
                    good: (result.onpage_seo.readability?.flesch_reading_ease ?? 0) >= 50,
                  },
                ].map((tile, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-page border border-divider/50 rounded-xl p-3 flex flex-col items-center text-center gap-1"
                  >
                    <span className={clsx("text-sm", tile.good ? "text-emerald-400" : "text-amber-400")}>
                      {tile.icon}
                    </span>
                    <span className="text-sm font-black text-primary-text">{tile.value}</span>
                    <span className="text-[8px] font-bold text-secondary-text uppercase tracking-wider">
                      {tile.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Detail columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Deductions */}
                <div className="space-y-2">
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                    Score Deductions
                  </div>
                  {result.onpage_seo.deductions?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {result.onpage_seo.deductions.map((d, idx) => (
                        <li key={idx} className="text-[10px] text-primary-text flex items-start gap-2 leading-relaxed">
                          <span className="text-red-400 font-black flex-shrink-0">−{d.points}</span>
                          <span>{d.reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-emerald-400">No on-page issues detected. 🎉</p>
                  )}
                </div>

                {/* Keyword density */}
                <div className="space-y-2">
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                    Keyword Density —{" "}
                    <span className="text-primary-text normal-case">
                      "{result.onpage_seo.content?.target_keyword}"
                    </span>{" "}
                    {result.onpage_seo.content?.target_keyword_density_pct}%
                  </div>
                  <ul className="space-y-1.5">
                    {result.onpage_seo.content?.top_keywords?.slice(0, 6).map((kw, idx) => (
                      <li key={idx} className="text-[10px] text-primary-text">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold">{kw.word}</span>
                          <span className="text-secondary-text">{kw.count}× · {kw.density_pct}%</span>
                        </div>
                        <div className="h-1 w-full bg-bg-page rounded-full overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(kw.density_pct * 12, 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Structure & links */}
                <div className="space-y-2">
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                    Structure & Links
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => (
                      <div key={h} className="bg-bg-page border border-divider/40 rounded-lg py-1.5">
                        <div className="text-xs font-black text-primary-text">
                          {result.onpage_seo.headings?.counts?.[h] ?? 0}
                        </div>
                        <div className="text-[8px] font-bold text-secondary-text uppercase">{h}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-primary-text pt-1">
                    <span className="text-secondary-text">Internal links</span>
                    <span className="font-bold">{result.onpage_seo.links?.internal ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-primary-text">
                    <span className="text-secondary-text">External links</span>
                    <span className="font-bold">{result.onpage_seo.links?.external ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-primary-text">
                    <span className="text-secondary-text">Word count</span>
                    <span className="font-bold">{result.onpage_seo.content?.word_count ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Real-Time Suggestions (Groq / Llama) — titles & alt tags */}
          {result.live_suggestions && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider flex items-center gap-1.5 border-b border-divider/50 pb-2.5">
                <FaBolt className="text-primary text-[9px]" /> Real-Time Suggestions
                <span className="text-[9px] text-secondary-text font-medium italic normal-case">— Llama via Groq</span>
              </span>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Title & meta options */}
                <div className="space-y-3">
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">Title Options</div>
                  {result.live_suggestions.titles?.map((t, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 bg-bg-page border border-divider/50 rounded-lg p-2.5">
                      <span className="text-[11px] text-primary-text leading-snug">{t.text}</span>
                      <button
                        onClick={() => handleCopyCode(t.text, `title-${idx}`)}
                        className="print:hidden text-secondary-text hover:text-primary-text flex-shrink-0"
                      >
                        {copiedKey === `title-${idx}` ? <FaCheck className="text-emerald-400 text-[10px]" /> : <FaCopy className="text-[10px]" />}
                      </button>
                    </div>
                  ))}
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider pt-1">Meta Descriptions</div>
                  {result.live_suggestions.meta_descriptions?.map((m, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 bg-bg-page border border-divider/50 rounded-lg p-2.5">
                      <span className="text-[11px] text-primary-text leading-snug">{m.text}</span>
                      <button
                        onClick={() => handleCopyCode(m.text, `meta-${idx}`)}
                        className="print:hidden text-secondary-text hover:text-primary-text flex-shrink-0"
                      >
                        {copiedKey === `meta-${idx}` ? <FaCheck className="text-emerald-400 text-[10px]" /> : <FaCopy className="text-[10px]" />}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Alt tag suggestions */}
                <div className="space-y-2">
                  <div className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                    Generated Alt Tags{" "}
                    {result.live_suggestions.alt_tags?.length > 0 && `(${result.live_suggestions.alt_tags.length})`}
                  </div>
                  {result.live_suggestions.alt_tags?.length > 0 ? (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {result.live_suggestions.alt_tags.map((a, idx) => (
                        <li key={idx} className="bg-bg-page border border-divider/50 rounded-lg p-2.5 space-y-1">
                          <div className="text-[9px] text-secondary-text truncate">{a.src}</div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] text-primary-text leading-snug">alt="{a.alt}"</span>
                            <button
                              onClick={() => handleCopyCode(`alt="${a.alt}"`, `alt-${idx}`)}
                              className="print:hidden text-secondary-text hover:text-primary-text flex-shrink-0"
                            >
                              {copiedKey === `alt-${idx}` ? <FaCheck className="text-emerald-400 text-[10px]" /> : <FaCopy className="text-[10px]" />}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-emerald-400">All images already have alt text. 🎉</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Localized Structured Data (Qwen 3) */}
          {result.structured_data?.localized_schema && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between border-b border-divider/50 pb-2.5">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider flex items-center gap-1.5">
                  <FaDatabase className="text-primary text-[9px]" /> Localized Schema
                  <span className="text-[9px] text-secondary-text font-medium italic normal-case">— Qwen 3</span>
                </span>
                <button
                  onClick={() => handleCopyCode(result.structured_data.localized_schema, "localized-schema")}
                  className="print:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-card border border-divider/50 hover:border-primary text-secondary-text hover:text-primary-text rounded text-[10px] font-bold transition-all cursor-pointer"
                >
                  {copiedKey === "localized-schema" ? <><FaCheck className="text-emerald-400" /> Copied</> : <><FaCopy /> Copy</>}
                </button>
              </div>
              <pre className="bg-black/30 border border-divider/30 rounded-lg p-3 text-[10px] text-primary-text overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                <code>{result.structured_data.localized_schema}</code>
              </pre>
            </div>
          )}

          {/* Row 1.5: Engine-Specific Visibility Breakdown */}
          {result.engine_breakdown?.length > 0 && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-divider/50 pb-2.5">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Engine-Specific Visibility Breakdown
                </span>
                <span className="text-[9px] text-secondary-text font-medium italic">
                  AI-estimated per engine
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {result.engine_breakdown.map((eng, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-page border border-divider/50 rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-primary-text">
                        {eng.engine}
                      </span>
                      <span
                        className={clsx(
                          "text-[10px] font-black px-2 py-0.5 rounded border flex-shrink-0",
                          scoreBadgeClass(eng.score),
                        )}
                      >
                        {eng.score}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-bg-card rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${eng.score}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-secondary-text leading-relaxed">
                      {eng.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 2: Summary Card */}
          <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 shadow-md">
            <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider block mb-2">
              Executive Summary Statement
            </span>
            <p className="text-xs sm:text-sm text-primary-text leading-relaxed font-medium font-sans">
              {result.summary}
            </p>
          </div>

          {/* Row 3: Strengths & Weaknesses Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths Card */}
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-divider/50 pb-2.5">
                ✓ AI Citation Strengths
              </span>
              <ul className="space-y-3">
                {result.strengths?.map((str, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-primary-text flex items-start gap-3 leading-relaxed font-medium"
                  >
                    <span className="h-5 w-5 rounded-full bg-emerald-955/20 text-emerald-455 border border-emerald-900/35 flex items-center justify-center text-[9px] flex-shrink-0 font-bold mt-0.5">
                      ✓
                    </span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weaknesses Card */}
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block border-b border-divider/50 pb-2.5">
                ✕ AI Visibility Gaps
              </span>
              <ul className="space-y-3">
                {result.weaknesses?.map((weak, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-primary-text flex items-start gap-3 leading-relaxed font-medium"
                  >
                    <span className="h-5 w-5 rounded-full bg-red-955/20 text-red-455 border border-red-900/35 flex items-center justify-center text-[9px] flex-shrink-0 font-bold mt-0.5">
                      ✕
                    </span>
                    <span>{weak}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Row 4: Technical Signals + Real AI Crawler Access Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Technical Crawler card */}
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider block border-b border-divider/50 pb-2.5">
                  Technical Crawler Signals
                </span>
                <div className="space-y-4 mt-4 text-xs font-semibold">
                  <div className="py-2 border-b border-divider/30">
                    <div className="text-secondary-text text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <FaRobot /> Robots.txt
                    </div>
                    <div className="text-primary-text mt-1.5 leading-relaxed font-medium">
                      {result.technical_audit?.robots_txt}
                    </div>
                  </div>
                  <div className="py-2 border-b border-divider/30">
                    <div className="text-secondary-text text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <FaDatabase /> Structured Schema
                    </div>
                    <div className="text-primary-text mt-1.5 leading-relaxed font-medium">
                      {result.technical_audit?.schema_markup}
                    </div>
                  </div>
                  <div className="py-2">
                    <div className="text-secondary-text text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <FaLink /> Sitemap Directory
                    </div>
                    <div className="text-primary-text mt-1.5 leading-relaxed font-medium">
                      {result.technical_audit?.sitemap}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-divider/50 pt-4 mt-4">
                <div className="text-[10px] text-secondary-text font-bold leading-normal">
                  Crawler signals dictate how LLM search agent bots index,
                  reference, and tag semantic entities.
                </div>
              </div>
            </div>

            {/* Real AI Crawler Access Status (live-checked robots.txt, not LLM-guessed) */}
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-divider/50 pb-2.5">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  AI Crawler Access Status
                </span>
                <button
                  onClick={handleRecheckCrawlers}
                  disabled={recheckingCrawlers}
                  className="print:hidden flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary-hover transition-all cursor-pointer disabled:opacity-50"
                >
                  <FaSync className={clsx("text-[9px]", recheckingCrawlers && "animate-spin")} />
                  {recheckingCrawlers ? "Re-testing..." : "Re-Test URL"}
                </button>
              </div>
              <div className="space-y-2">
                {crawlerStatus.length > 0 ? (
                  crawlerStatus.map((c, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs font-semibold text-primary-text"
                    >
                      <span>{c.bot}</span>
                      <span
                        className={clsx(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full border",
                          crawlerBadgeClass(c.status),
                        )}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-secondary-text">
                    Crawler status unavailable for this scan.
                  </p>
                )}
              </div>
              <p className="text-[10px] text-secondary-text leading-relaxed border-t border-divider/30 pt-3">
                Checked live against this site's robots.txt — not an AI estimate.
                Use Re-Test after deploying a fix.
              </p>
            </div>
          </div>

          {/* Row 4.5: Impact vs Effort Execution Matrix */}
          {result.impact_effort_matrix && (
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider block">
                Impact vs Effort Execution Matrix
              </span>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Wins */}
                <div className="bg-bg-card/30 border border-emerald-900/40 rounded-2xl p-6 space-y-3">
                  <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    Quick Wins
                  </div>
                  <p className="text-[9px] text-secondary-text uppercase tracking-wide font-bold">
                    High Impact &middot; Low Effort
                  </p>
                  <ul className="space-y-2.5 pt-1">
                    {result.impact_effort_matrix.quick_wins?.map((item, idx) => (
                      <li key={idx} className="text-xs text-primary-text leading-relaxed flex items-start gap-2">
                        <FaCheck className="text-emerald-400 text-[10px] flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Strategic Growth */}
                <div className="bg-bg-card/30 border border-primary/40 rounded-2xl p-6 space-y-3">
                  <div className="text-xs font-black text-primary uppercase tracking-wider">
                    Strategic Growth
                  </div>
                  <p className="text-[9px] text-secondary-text uppercase tracking-wide font-bold">
                    High Impact &middot; High Effort
                  </p>
                  <ul className="space-y-2.5 pt-1">
                    {result.impact_effort_matrix.strategic_growth?.map((item, idx) => (
                      <li key={idx} className="text-xs text-primary-text leading-relaxed flex items-start gap-2">
                        <FaChartBar className="text-primary text-[10px] flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Low Priority */}
                <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-3">
                  <div className="text-xs font-black text-secondary-text uppercase tracking-wider">
                    Low Priority
                  </div>
                  <p className="text-[9px] text-secondary-text uppercase tracking-wide font-bold">
                    Low Impact &middot; Low Effort
                  </p>
                  <ul className="space-y-2.5 pt-1">
                    {result.impact_effort_matrix.low_priority?.map((item, idx) => (
                      <li key={idx} className="text-xs text-secondary-text leading-relaxed flex items-start gap-2">
                        <span className="text-secondary-text flex-shrink-0">&middot;</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Row 5: Copy-Paste Ready Fixes */}
          {result.code_fixes?.length > 0 && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider flex items-center gap-1.5 border-b border-divider/50 pb-2.5">
                <FaCode className="text-primary text-[9px]" /> Copy-Paste
                Ready Fixes
              </span>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {result.code_fixes.map((fix, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-page border border-divider/50 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-primary-text">
                          {fix.title}
                        </div>
                        <div className="text-[10px] text-secondary-text mt-1 leading-relaxed">
                          {fix.description}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopyCode(fix.code, `code-${idx}`)}
                        className="print:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-card border border-divider/50 hover:border-primary text-secondary-text hover:text-primary-text rounded text-[10px] font-bold transition-all cursor-pointer flex-shrink-0"
                      >
                        {copiedKey === `code-${idx}` ? (
                          <>
                            <FaCheck className="text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <FaCopy /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="bg-black/30 border border-divider/30 rounded-lg p-3 text-[10px] text-primary-text overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                      <code>{fix.code}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 6: Page-by-Page Breakdown */}
          {result.page_reports?.length > 0 && (
            <div className="bg-bg-card/30 border border-divider/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-divider/50 pb-2.5">
                <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider flex items-center gap-1.5">
                  <FaGlobe className="text-primary text-[9px]" /> Page-by-Page
                  Breakdown
                </span>
                <span className="text-[10px] text-secondary-text font-medium">
                  {result.page_reports.length} page
                  {result.page_reports.length === 1 ? "" : "s"} scanned
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.page_reports.map((page, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-page border border-divider/50 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-primary-text truncate">
                          {page.title || page.url}
                        </div>
                        <div className="text-[10px] text-secondary-text truncate mt-0.5">
                          {page.url}
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "text-[10px] font-black px-2 py-1 rounded border flex-shrink-0",
                          scoreBadgeClass(page.visibility_score),
                        )}
                      >
                        {page.visibility_score}%
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary-text leading-relaxed">
                      {page.summary}
                    </p>
                    {page.fixes?.length > 0 && (
                      <ul className="space-y-1.5 pt-1 border-t border-divider/30">
                        {page.fixes.map((fix, fixIdx) => (
                          <li
                            key={fixIdx}
                            className="text-[10px] text-primary-text flex items-start gap-2 leading-relaxed"
                          >
                            <span className="text-primary flex-shrink-0 mt-0.5">
                              →
                            </span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {page.meta_fix && (
                      <div className="border-t border-divider/30 pt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-secondary-text uppercase tracking-wider">
                            Copy-Paste Meta Fix
                          </span>
                          <button
                            onClick={() =>
                              handleCopyCode(
                                `<title>${page.meta_fix.title}</title>\n<meta name="description" content="${page.meta_fix.description}" />`,
                                `page-${idx}-meta`,
                              )
                            }
                            className="print:hidden flex items-center gap-1 px-2 py-1 bg-bg-card border border-divider/50 hover:border-primary text-secondary-text hover:text-primary-text rounded text-[9px] font-bold transition-all cursor-pointer"
                          >
                            {copiedKey === `page-${idx}-meta` ? (
                              <>
                                <FaCheck className="text-emerald-400" /> Copied
                              </>
                            ) : (
                              <>
                                <FaCopy /> Copy
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="bg-black/30 border border-divider/30 rounded-lg p-2.5 text-[9px] text-primary-text overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                          <code>{`<title>${page.meta_fix.title}</title>\n<meta name="description" content="${page.meta_fix.description}" />`}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
