const config = {
  appName: "Synapcite",
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    webhook_url: process.env.WEBHOOK_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    plans: {
      basic: { id: "basic", name: "Basic Pack", credits: 1000, price: 500 },
      standard: { id: "standard", name: "Standard Pack", credits: 2000, price: 1000 },
      pro: { id: "pro", name: "Professional Pack", credits: 4000, price: 2000 },
      business: { id: "business", name: "Business Pack", credits: 10000, price: 5000 },
    }
  },
  ai: {
    apiKey: process.env.GEMINI_API_KEY || process.env.MUAPIAPP_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    freeMode: process.env.FREE_MODE === "true", // If true, skips credit deduction
    generationCost: process.env.GENERATION_COST ? parseInt(process.env.GENERATION_COST) : 18,
    // Multi-model optimization pipeline providers.
    // Gemini = full-page crawl + core audit; Qwen 3 (OpenRouter) = JSON-LD &
    // localized schema; Llama (Groq) = real-time title/alt-tag suggestions.
    providers: {
      gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || "qwen/qwen3-32b",
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      },
    },
  }
};
export default config;
