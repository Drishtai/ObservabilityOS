import Link from "next/link";
import { cookies } from "next/headers";
import {
  Github,
  Activity,
  Shield,
  Terminal,
  Zap,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  Server,
  Layers,
  MessageSquare,
  Play,
  ExternalLink,
  Cpu,
  Clock,
  Sparkles,
  RefreshCw,
  Workflow,
} from "lucide-react";
import jwt from "jsonwebtoken";

// Import our custom client components
import SDKSwitcher from "@/components/SDKSwitcher";
import InteractiveDemo from "@/components/InteractiveDemo";
import FAQAccordion from "@/components/FAQAccordion";
import BackToTop from "@/components/BackToTop";
import { PLANS } from "@/lib/plans";

export const metadata = {
  title:
    "ObservabilityOS — AI-Native DevOps Intelligence & Log Anomaly Detection Platform",
  description:
    "Zero-config npm SDK and Docker sidecar. Ingest telemetry, auto-scrub PII, detect anomalies using Z-scores, and generate GPT-4/Claude root-cause post-mortems in seconds.",
  keywords: [
    "AI observability",
    "log analytics",
    "anomaly detection",
    "root cause analysis",
    "observability platform",
    "developer monitoring",
    "OpenTelemetry monitoring",
  ],
  alternates: {
    canonical: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
};

export default async function LandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let isLoggedIn = false;

  if (token) {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      try {
        jwt.verify(token, jwtSecret);
        isLoggedIn = true;
      } catch {
        // Invalid token
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ObservabilityOS",
    url: baseUrl,
    logo: `${baseUrl}/favicon.ico`,
    sameAs: ["https://github.com/Vaibhav-Singh2/ObservabilityOS"],
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ObservabilityOS",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "All",
    offers: {
      "@type": "Offer",
      price: "29.00",
      priceCurrency: "USD",
      priceModel: "https://schema.org/Subscription",
    },
    description:
      "AI-native incident post-mortems and telemetry anomaly detection platform. Ingest telemetry, redaction scrub, and resolve incidents 10x faster.",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "128",
    },
  };

  const webSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ObservabilityOS",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does ObservabilityOS ensure log data privacy & security?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "All incoming telemetry passes through our high-performance PII scrubbing engine (scrubber.ts) before database storage. It automatically redacts database credentials, authorization headers, JWT strings, credit card numbers, and custom regex patterns you define.",
        },
      },
      {
        "@type": "Question",
        name: "Does the SDK add network latency to my API endpoints?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. The Node.js SDK utilizes an in-memory ring-buffer for high-throughput batching. Logs are stored instantly in memory and flushed asynchronously in the background. The SDK runs on a non-blocking queue.",
        },
      },
      {
        "@type": "Question",
        name: "How accurate is the statistical Z-score anomaly detection?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We use dynamic rolling baselines to calculate standard deviation spikes (Z-score) on error rates, latency, and CPU usage. Our model adapts to weekly/daily traffic cycles, reducing pager noise by up to 98%.",
        },
      },
      {
        "@type": "Question",
        name: "How does the AI incident root-cause diagnosis work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "When a Z-score threshold is breached, we package the surrounding context: matching error log context, active route signatures, and GitHub webhook deployment events. We pipeline this to GPT-4/Claude via structured prompts to generate a comprehensive markdown post-mortem.",
        },
      },
      {
        "@type": "Question",
        name: "Is ObservabilityOS compatible with OpenTelemetry (OTLP)?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, fully. The ObservabilityOS ingestion API supports native OTLP HTTP/JSON protocols. If you already use OpenTelemetry collectors, you can simply append our ingestion endpoint and API key to your configuration.",
        },
      },
    ],
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans overflow-x-hidden relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* Background gradients for premium aesthetic */}
      <div className="absolute top-0 left-1/4 w-125 h-125 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-300 right-1/4 w-150 h-150 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-130 h-130 bg-purple-500/5 rounded-full blur-[130px] pointer-events-none" />

      {/* Header / Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/75 border-b border-slate-900/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent">
              ObservabilityOS
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <Link
              href="#product"
              className="hover:text-slate-200 transition-colors"
            >
              Product
            </Link>
            <Link
              href="#features"
              className="hover:text-slate-200 transition-colors"
            >
              Features
            </Link>
            <Link href="#dx" className="hover:text-slate-200 transition-colors">
              Developer Experience
            </Link>
            <Link
              href="#pricing"
              className="hover:text-slate-200 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="#faq"
              className="hover:text-slate-200 transition-colors"
            >
              FAQ
            </Link>
            <Link
              href="/blog"
              className="hover:text-slate-200 transition-colors"
            >
              Blog
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors flex items-center gap-0.5"
            >
              Docs
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>
            <a
              href="https://github.com/Vaibhav-Singh2/ObservabilityOS"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors flex items-center gap-1"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>
          </nav>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                id="header_dashboard_btn"
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-9 rounded-lg text-sm font-medium transition-all duration-200 shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  id="header_login_btn"
                  href="/login"
                  className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 h-9 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  Sign In
                </Link>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-950 px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer"
                >
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full relative z-10">
        {/* HERO SECTION */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 text-center flex flex-col items-center">
          {/* Badges */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" />
              AI-Native DevOps Intelligence
            </div>
            <a
              href={`${
                process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"
              }/docs/deployment`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              100% Source-Available Self-Host Available
            </a>
          </div>

          <h1 className="text-4xl sm:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 max-w-4xl bg-linear-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Go from raw logs to AI post-mortems in seconds.
          </h1>

          <p className="text-base sm:text-xl text-slate-400 max-w-3xl leading-relaxed mb-10">
            ObservabilityOS ingests structured logs, automatically scrubs PII,
            detects latency and error anomalies using statistical Z-scores, and
            generates GPT-4/Claude root-cause post-mortems. Stop grepping at 2
            AM.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 w-full sm:w-auto">
            {isLoggedIn ? (
              <Link
                id="hero_dashboard_btn"
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 text-slate-950 font-bold h-12 px-8 rounded-xl transition-all duration-200 hover:-translate-y-0.5 shadow-lg shadow-white/5 cursor-pointer"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                id="hero_login_btn"
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 text-slate-950 font-bold h-12 px-8 rounded-xl transition-all duration-200 hover:-translate-y-0.5 shadow-lg shadow-white/5 cursor-pointer"
              >
                <Shield className="w-5 h-5" />
                Sign In to Dashboard
              </Link>
            )}
            <a
              href={`${
                process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"
              }/docs/deployment`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-slate-200 font-semibold h-12 px-6 rounded-xl transition-all duration-200 cursor-pointer"
            >
              <Github className="w-4 h-4 text-emerald-450" />
              Self-Host (Free)
            </a>
            <a
              href={process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-slate-200 font-semibold h-12 px-6 rounded-xl transition-all duration-200 cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-indigo-400" />
              Read Docs
            </a>
          </div>

          {/* Social Proof & Trust Badges */}
          <div className="w-full max-w-4xl border-b border-slate-900 pb-16">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-6 font-sans">
              Integrates directly with your development stack
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-60">
              <span className="text-sm font-bold font-sans text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{" "}
                OpenTelemetry Native
              </span>
              <span className="text-sm font-bold font-sans text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />{" "}
                Secure PII Redaction
              </span>
              <span className="text-sm font-bold font-sans text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />{" "}
                GitHub Deploy Sync
              </span>
              <span className="text-sm font-bold font-sans text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />{" "}
                Slack/Discord Webhooks
              </span>
            </div>
          </div>
        </section>

        {/* INTERACTIVE PRODUCT DEMO SECTION */}
        <section
          id="product"
          className="max-w-7xl mx-auto px-6 py-12 text-center flex flex-col items-center"
        >
          <div className="mb-12">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4 text-white">
              See the intelligence live
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              Datadog shows you everything and explains nothing. We show you
              what matters and explain it in plain English. Interact with our
              live mockup below.
            </p>
          </div>
          <InteractiveDemo />
        </section>

        {/* PROBLEM SECTION */}
        <section className="bg-slate-900/10 border-y border-slate-900/80 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
                Traditional Monitoring is Broken
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
                Modern software systems emit gigabytes of logs, but finding the
                exact commit that broke production remains a manual, stressful
                scavenger hunt.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Pain Point 1 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-3">
                  Alert Fatigue
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Legacy systems spam your channels with 1,000+ alerts
                  representing minor CPU fluctuations, burying critical product
                  database failures under endless noise.
                </p>
              </div>

              {/* Pain Point 2 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6">
                  <Server className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-3">
                  Dashboard Overload
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Grafana and Datadog provide 100+ generic graph configurations.
                  But when an incident occurs, you still have to manually trace
                  timelines to find the root cause.
                </p>
              </div>

              {/* Pain Point 3 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
                  <Terminal className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-3">
                  The 2 AM Log Crawl
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  When a service crashes, engineers spend hours typing log grep
                  queries in terminals, attempting to link random timeout lines
                  back to the latest GitHub release.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SOLUTION SECTION - VISUAL WORKFLOW */}
        <section className="py-24 max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              How ObservabilityOS works
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              An intelligent, automated workflow that processes raw logs and
              returns actionable resolutions.
            </p>
          </div>

          <div className="relative">
            {/* Connection Line */}
            <div className="hidden lg:block absolute top-1/2 left-4 right-4 h-0.5 bg-linear-to-r from-indigo-500/20 via-emerald-500/20 to-indigo-500/20 -translate-y-1/2 z-0" />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
              {/* Step 1 */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-2xl text-left hover:border-slate-850 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold font-mono">
                    01
                  </div>
                  <Cpu className="w-5 h-5 text-slate-500" />
                </div>
                <h4 className="font-bold text-slate-200 mb-2">Ingest Logs</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Integrate our zero-dependency SDK in one line or connect your
                  Docker containers. Telemetry is scrubbed of sensitive PII
                  locally before shipping.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-2xl text-left hover:border-slate-850 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold font-mono">
                    02
                  </div>
                  <Workflow className="w-5 h-5 text-slate-500" />
                </div>
                <h4 className="font-bold text-slate-200 mb-2">
                  Detect Anomalies
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Statistical Z-score algorithms analyze error ratios and
                  latency response times in real-time, immediately isolating
                  anomalies from normal traffic patterns.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-2xl text-left hover:border-slate-850 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold font-mono">
                    03
                  </div>
                  <Sparkles className="w-5 h-5 text-slate-500" />
                </div>
                <h4 className="font-bold text-slate-200 mb-2">AI Analyzes</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Our LLM processing pipeline ingests structured logs,
                  environment variables, and GitHub commit diffs to compile a
                  full-context root cause description.
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-2xl text-left hover:border-slate-850 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold font-mono shadow-md shadow-indigo-600/20">
                    04
                  </div>
                  <MessageSquare className="w-5 h-5 text-slate-500" />
                </div>
                <h4 className="font-bold text-slate-200 mb-2">
                  Get Actionable Report
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Receive a detailed Slack/Discord incident alert mapping out
                  exactly what code broke, why, and providing a direct rollback
                  button.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID SECTION */}
        <section
          id="features"
          className="bg-slate-900/10 border-y border-slate-900/80 py-24"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
                Enterprise Capabilities. Startup Simplicity.
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
                ObservabilityOS is built with high-throughput ingestion and AI
                analytics to help modern engineering teams deploy code with
                complete confidence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1: AI Incident Reports */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  AI Incident Reports
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Instant diagnostic summaries instead
                  of raw log greps.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Lower Mean Time to Resolution (MTTR)
                  by 80%.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-indigo-300">
                  Runs GPT-4/Claude query pipelines on log errors
                </div>
              </div>

              {/* Feature 2: Anomaly Detection */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  Anomaly Detection
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Zero threshold configurations.
                  Adapts to weekly traffic trends.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> No alert spam or false positives.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-emerald-300">
                  Performs rolling Z-score math on error frequencies
                </div>
              </div>

              {/* Feature 3: SDK Ingestion */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <Terminal className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  SDK Ingestion
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Non-blocking API calls.
                  Zero-dependency node installation.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> 100% app safety with background
                  batch queue operations.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-purple-300">
                  Memory-buffered background ring-buffer flushes
                </div>
              </div>

              {/* Feature 4: Real-Time Monitoring */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                  <Play className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  Real-Time SSE Monitoring
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Live system telemetry flows without
                  page refreshes.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Immediate confirmation of system
                  hotfixes.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-blue-300">
                  SSE connection channels stream stdout live
                </div>
              </div>

              {/* Feature 5: Intelligent Alerting */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-4">
                  <MessageSquare className="w-5 h-5 text-pink-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  Multi-channel Webhooks
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Slack, Discord, and Teams
                  integration out of the box.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Alerts delivered directly to your
                  shared developer workspace.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-pink-300">
                  Dispatches rich layout blocks via webhook payloads
                </div>
              </div>

              {/* Feature 6: Root Cause Analysis */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  Root Cause Analysis
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Automatic correlation between deploy
                  times and error spikes.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Pinpoint the exact line of code that
                  introduced the bug.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-amber-300">
                  Maps GitHub commit histories to anomaly timestamps
                </div>
              </div>

              {/* Feature 7: Team Collaboration */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
                  <Workflow className="w-5 h-5 text-orange-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  Incident Collaboration
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Shared threads and runbooks inside
                  the dashboard.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Developers work together on
                  resolution instead of silos.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-orange-300">
                  Supports threaded commenting on active incidents
                </div>
              </div>

              {/* Feature 8: Autogenerated Dashboards */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4">
                  <Layers className="w-5 h-5 text-sky-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  No-Config Dashboards
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Dashboards are autogenerated from
                  log metadata.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> No time wasted building, tweaking,
                  or correcting charts.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-sky-300">
                  Dynamic microservice status registries
                </div>
              </div>

              {/* Feature 9: API-First Access */}
              <div className="bg-slate-950 border border-slate-900 p-6 rounded-xl hover:border-slate-800 transition-all">
                <div className="w-10 h-10 rounded-lg bg-slate-500/10 border border-slate-500/20 flex items-center justify-center mb-4">
                  <RefreshCw className="w-5 h-5 text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-2">
                  API & CSV Logs Export
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Benefit:</strong> Fast structured JSON logs queries
                  via Lucene index.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  <strong>Outcome:</strong> Easily load telemetry inside scripts
                  or export for compliance.
                </p>
                <div className="text-[11px] font-mono bg-slate-900 px-2.5 py-1.5 rounded text-slate-300">
                  Lucene-based MongoDB Atlas Search API route
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DEVELOPER EXPERIENCE (SDK SWITCHER) */}
        <section
          id="dx"
          className="py-24 max-w-7xl mx-auto px-6 text-center flex flex-col items-center"
        >
          <div className="mb-12">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              Integrated in under 5 minutes
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              A zero-dependency, local-scrubbing SDK for your favorite runtime.
              Copy the snippet below and start sending telemetry in seconds.
            </p>
          </div>
          <SDKSwitcher />
        </section>

        {/* COMPARISON TABLE */}
        <section className="bg-slate-900/10 border-y border-slate-900/80 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
                ObservabilityOS vs Legacy Monitoring
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
                Why developers choose ObservabilityOS over traditional
                monitoring stacks.
              </p>
            </div>

            <div className="w-full overflow-x-auto rounded-2xl border border-slate-900 bg-slate-950/40">
              <table className="w-full min-w-150 text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-900/20 text-slate-400 font-semibold font-mono text-xs uppercase">
                    <th className="p-4">Feature Comparison</th>
                    <th className="p-4 text-indigo-400">ObservabilityOS</th>
                    <th className="p-4">Traditional Monitoring</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-slate-300">
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      Setup Time
                    </td>
                    <td className="p-4 text-indigo-400 font-semibold">
                      1 Minute (One-line SDK / Sidecar)
                    </td>
                    <td className="p-4 text-slate-500">
                      Days of config, YAML setups & agent configurations
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      Root-Cause Pinpointing
                    </td>
                    <td className="p-4 text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />{" "}
                      Automated AI Post-mortems
                    </td>
                    <td className="p-4 text-slate-500 flex items-center gap-1.5">
                      <X className="w-4 h-4 shrink-0 text-red-500" /> Manual
                      timeline correlations & log grep queries
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      Alert Signal-to-Noise
                    </td>
                    <td className="p-4 text-indigo-400 font-semibold">
                      98% noise reduction via rolling Z-score
                    </td>
                    <td className="p-4 text-slate-500">
                      High spam (static CPU alerts waking teams at 3 AM)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      PII Data Protection
                    </td>
                    <td className="p-4 text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />{" "}
                      Local SDK scrubbing (scrubber.ts)
                    </td>
                    <td className="p-4 text-slate-500 flex items-center gap-1.5">
                      <X className="w-4 h-4 shrink-0 text-red-500" /> Forwarded
                      blindly (security compliance hazards)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      OpenTelemetry support
                    </td>
                    <td className="p-4 text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />{" "}
                      Native compliance (HTTP OTLP Ingest)
                    </td>
                    <td className="p-4 text-slate-500">
                      Requires complex exporter pipelines
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold text-slate-200">
                      Pricing Predictability
                    </td>
                    <td className="p-4 text-indigo-400 font-semibold">
                      Flat $29/mo (no host/seat limits)
                    </td>
                    <td className="p-4 text-slate-500">
                      Complex matrices (charges per host, metric, & seat)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS LIST */}
        <section className="py-24 max-w-7xl mx-auto px-6 text-center">
          <div className="mb-12">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              Works with your existing toolchain
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              ObservabilityOS integrates seamlessly into standard backend
              systems, cloud clusters, and chat workspaces.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
            {/* Badges */}
            {[
              {
                label: "Node.js",
                color:
                  "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
              },
              {
                label: "Next.js",
                color: "bg-slate-900/60 border-slate-800 text-slate-200",
              },
              {
                label: "Express",
                color: "bg-slate-900/60 border-slate-800 text-slate-300",
              },
              {
                label: "Docker",
                color: "bg-blue-500/10 border-blue-500/20 text-blue-400",
              },
              {
                label: "Kubernetes",
                color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
              },
              {
                label: "PostgreSQL",
                color: "bg-sky-500/10 border-sky-500/20 text-sky-400",
              },
              {
                label: "Redis",
                color: "bg-red-500/10 border-red-500/20 text-red-400",
              },
              {
                label: "OpenTelemetry",
                color: "bg-amber-500/10 border-amber-500/20 text-amber-400",
              },
              {
                label: "Slack Alerts",
                color: "bg-purple-500/10 border-purple-500/20 text-purple-400",
              },
              {
                label: "Discord webhooks",
                color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300",
              },
              {
                label: "GitHub App",
                color: "bg-slate-900/60 border-slate-800 text-slate-300",
              },
            ].map((tech, idx) => (
              <span
                key={idx}
                className={`px-4 py-2 rounded-xl border text-xs font-semibold font-mono ${tech.color}`}
              >
                {tech.label}
              </span>
            ))}
          </div>
        </section>

        {/* TESTIMONIALS / SOCIAL PROOF */}
        <section className="bg-slate-900/10 border-y border-slate-900/80 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
                What developers are saying
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
                Modern teams have replaced complex Grafana setup tasks with
                ObservabilityOS.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Testimonial 1 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl flex flex-col justify-between">
                <p className="text-sm text-slate-350 italic leading-relaxed">
                  &ldquo;ObservabilityOS changed our developer workflow
                  overnight. When our payments microservice began timeouts, the
                  AI flagged the exact database release commit before our
                  pagerDuty call went off. Our MTTR dropped from 45 minutes to
                  30 seconds.&rdquo;
                </p>
                <div className="mt-6 border-t border-slate-900/60 pt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs select-none">
                    JS
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      Jason Sanders
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase font-mono mt-0.5">
                      CTO @ PaymentsFlow
                    </p>
                  </div>
                </div>
              </div>

              {/* Testimonial 2 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl flex flex-col justify-between">
                <p className="text-sm text-slate-350 italic leading-relaxed">
                  &ldquo;We migrated our Express APIs from Datadog in 10
                  minutes. The in-memory SDK queue configuration means our
                  endpoint request latency did not spike at all. The automatic
                  Z-score algorithm filters out 99% of noisy telemetry
                  alerts.&rdquo;
                </p>
                <div className="mt-6 border-t border-slate-900/60 pt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xs select-none">
                    AM
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      Alex Mercer
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase font-mono mt-0.5">
                      Lead DevOps @ CloudVibe
                    </p>
                  </div>
                </div>
              </div>

              {/* Testimonial 3 */}
              <div className="bg-slate-950/60 border border-slate-900 p-8 rounded-2xl flex flex-col justify-between">
                <p className="text-sm text-slate-350 italic leading-relaxed">
                  &ldquo;The secure PII scrubbing engine (scrubber.ts) is
                  standard compliance gold. We audit logs for client
                  authorization headers and tokens before writing logs to any
                  storage. ObservabilityOS handles all recursive redaction
                  automatically.&rdquo;
                </p>
                <div className="mt-6 border-t border-slate-900/60 pt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white text-xs select-none">
                    HK
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      Hannah Kim
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase font-mono mt-0.5">
                      Head of Security @ MedVault
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Testimonial Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 text-center border-t border-slate-900 pt-16">
              <div>
                <strong className="text-3xl sm:text-4xl font-extrabold text-white block">
                  10x
                </strong>
                <span className="text-xs text-slate-500 uppercase font-mono mt-1 block">
                  Faster Resolution
                </span>
              </div>
              <div>
                <strong className="text-3xl sm:text-4xl font-extrabold text-white block">
                  5 Mins
                </strong>
                <span className="text-xs text-slate-500 uppercase font-mono mt-1 block">
                  Setup Integration
                </span>
              </div>
              <div>
                <strong className="text-3xl sm:text-4xl font-extrabold text-white block">
                  98%
                </strong>
                <span className="text-xs text-slate-500 uppercase font-mono mt-1 block">
                  Fewer False Alerts
                </span>
              </div>
              <div>
                <strong className="text-3xl sm:text-4xl font-extrabold text-white block">
                  99.99%
                </strong>
                <span className="text-xs text-slate-500 uppercase font-mono mt-1 block">
                  Uptime Maintained
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING PREVIEW */}
        <section
          id="pricing"
          className="py-24 max-w-7xl mx-auto px-6 text-center flex flex-col items-center"
        >
          <div className="mb-16">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              Simple, developer-first pricing
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              No host-counting or per-seat fees. Choose a plan that aligns with
              your logging throughput requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
            {PLANS.map((plan) => {
              const isHighlighted = plan.id === "pro";

              return (
                <div
                  key={plan.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between text-left transition-colors ${
                    isHighlighted
                      ? "bg-slate-900 border-2 border-indigo-500/40 relative shadow-xl shadow-indigo-900/10"
                      : "bg-slate-950 border border-slate-900 hover:border-slate-850"
                  }`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className="absolute top-0 right-5 -translate-y-1/2 bg-linear-to-r from-indigo-600 to-violet-600 text-white text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                      {plan.badge}
                    </div>
                  )}

                  <div>
                    <h3 className="text-base font-bold text-slate-200 flex items-center gap-1.5">
                      {plan.name}
                      {plan.id === "pro" && (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      )}
                      {plan.id === "self-host" && (
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-550 mt-1.5 leading-relaxed">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="my-5">
                      <strong className="text-3xl font-extrabold text-white">
                        {plan.priceUSD === 0 ? "Free" : `$${plan.priceUSD}`}
                      </strong>
                      <span className="text-xs text-slate-500">
                        {plan.priceUSD === 0
                          ? " / Source-Available"
                          : " / month"}
                      </span>
                      {plan.id === "pro" && (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          ≈ ₹2,499 / month in India
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 text-xs text-slate-350 border-t border-slate-900/60 pt-5">
                      {plan.features.map((feature, i) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 ${
                            feature.included
                              ? ""
                              : "text-slate-650 line-through"
                          }`}
                        >
                          {feature.included ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-slate-700 shrink-0 mt-0.5" />
                          )}
                          {feature.text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA */}
                  {plan.id === "self-host" ? (
                    <a
                      href={`${
                        process.env.NEXT_PUBLIC_DOCS_URL ||
                        "http://localhost:3001"
                      }/docs/deployment`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-6 w-full inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold h-10 rounded-lg text-xs transition-colors cursor-pointer text-center"
                    >
                      Deploy Now
                    </a>
                  ) : (
                    <Link
                      href="/login"
                      className={`mt-6 w-full inline-flex items-center justify-center h-10 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        plan.id === "pro"
                          ? "bg-white hover:bg-slate-100 text-slate-950 font-bold hover:-translate-y-0.5 shadow-md shadow-white/5"
                          : "bg-slate-900 hover:bg-slate-800 text-slate-200"
                      }`}
                    >
                      {plan.id === "free" ? "Start Free" : "Upgrade Now"}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expansion Revenue Info */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 max-w-5xl w-full mt-8 text-left">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-semibold">
                Usage-based add-ons:
              </span>{" "}
              Log overages at <span className="text-slate-350">$0.10/GB</span>{" "}
              above plan limit · Additional AI analysis credits at{" "}
              <span className="text-slate-350">$20 / 100 credits</span> · Extra
              seats at <span className="text-slate-350">$30/seat/mo</span> ·{" "}
              <span className="text-indigo-400 font-semibold">20% off</span>{" "}
              with annual billing.
            </p>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section
          id="faq"
          className="bg-slate-900/10 border-y border-slate-900/80 py-24"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-4 font-sans">
                Frequently Asked Questions
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto font-sans">
                Everything you need to know about log shipping, data scrubbing,
                billing, and AI post-mortems.
              </p>
            </div>
            <FAQAccordion />
          </div>
        </section>

        {/* DOCUMENTATION CTA & FINAL CTA SECTION */}
        <section className="py-24 max-w-4xl mx-auto px-6 text-center">
          <div className="bg-linear-to-br from-indigo-900/40 via-slate-950 to-indigo-950/20 border border-indigo-500/10 rounded-3xl p-10 sm:p-16 relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.08),transparent_55%)] pointer-events-none" />

            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 relative z-10">
              Deploy in under 5 minutes.
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-lg mx-auto mb-10 relative z-10 leading-relaxed">
              Join teams resolving system errors 10x faster. Create your free
              account today, install our SDK, and let the AI map your production
              health automatically.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10 w-full sm:w-auto">
              {isLoggedIn ? (
                <Link
                  id="final_dashboard_btn"
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-950 font-bold h-12 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-white/5 cursor-pointer"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  id="final_login_btn"
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-950 font-bold h-12 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-white/5 cursor-pointer"
                >
                  <Shield className="w-5 h-5" />
                  Sign In to Dashboard
                </Link>
              )}
              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001"}/docs/quickstart`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold h-12 px-8 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-indigo-400" />
                Install local SDK
              </a>
            </div>

            <div className="mt-8 text-[11px] text-slate-500 flex justify-center gap-6 relative z-10">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-emerald-500" /> Secure OAuth
                Signup
              </span>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-indigo-500" /> Free Tier
                forever
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-purple-500" /> OTLP Compliant
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-16 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Column 1: Brand */}
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-base text-slate-200">
                  ObservabilityOS
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                AI-native incident post-mortems and telemetry anomaly detection
                platform. Ingest telemetry, redaction scrub, and resolve
                incidents 10x faster.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/Vaibhav-Singh2/ObservabilityOS"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-slate-350 transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Column 2: Product & Resources */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Product
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-sans">
                <li>
                  <Link
                    href="#product"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Interactive Demo
                  </Link>
                </li>
                <li>
                  <Link
                    href="#features"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Features Grid
                  </Link>
                </li>
                <li>
                  <Link
                    href="#pricing"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Predictable Pricing
                  </Link>
                </li>
                <li>
                  <a
                    href={
                      process.env.NEXT_PUBLIC_DOCS_URL ||
                      "http://localhost:3001"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <Link
                    href="#faq"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Technical FAQs
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Blog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Alternatives */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Compare
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-sans">
                <li>
                  <Link
                    href="/vs/datadog"
                    className="hover:text-slate-350 transition-colors"
                  >
                    vs Datadog
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vs/new-relic"
                    className="hover:text-slate-350 transition-colors"
                  >
                    vs New Relic
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vs/grafana"
                    className="hover:text-slate-350 transition-colors"
                  >
                    vs Grafana
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vs/sentry"
                    className="hover:text-slate-350 transition-colors"
                  >
                    vs Sentry
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vs/better-stack"
                    className="hover:text-slate-350 transition-colors"
                  >
                    vs Better Stack
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Guides */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Guides
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-sans">
                <li>
                  <Link
                    href="/guides/opentelemetry-monitoring-guide"
                    className="hover:text-slate-350 transition-colors"
                  >
                    OpenTelemetry Guide
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/ai-incident-analysis-guide"
                    className="hover:text-slate-350 transition-colors"
                  >
                    AI Incident Analysis
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/log-analytics-best-practices"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Log Analytics Tips
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/Vaibhav-Singh2/ObservabilityOS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-slate-350 transition-colors flex items-center gap-1"
                  >
                    Source-Available Code{" "}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 5: Company */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Company
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 font-sans">
                <li>
                  <Link
                    href="/privacy"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@observabilityos.in"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Support Email
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@observabilityos.in"
                    className="hover:text-slate-350 transition-colors"
                  >
                    Contact Sales
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-900/60 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <div>
              &copy; {new Date().getFullYear()} ObservabilityOS. All rights
              reserved.
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600">
              <span>Built with Turborepo, Next.js, and Tailwind v4</span>
            </div>
          </div>
        </div>
      </footer>
      <BackToTop />
    </div>
  );
}
