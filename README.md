# ObservabilityOS

[![License: Source Available](https://img.shields.io/badge/License-Source_Available-orange.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-v16.2-black.svg)]()

🔗 **Quick Links**: [Live Console](https://observabilityos.in) | [Documentation](https://docs.observabilityos.in) | [NPM Package (@observability-os/sdk)](https://www.npmjs.com/package/@observability-os/sdk)

ObservabilityOS is an **AI-native DevOps intelligence, distributed APM tracing, and log analytics platform** built for high-performance engineering teams. Instead of just displaying raw logs and complex dashboard grids, ObservabilityOS ingests structured logs and distributed trace spans, automatically redacts sensitive PII locally, calculates standard-deviation anomaly Z-Scores in real-time, visualizes execution flamegraphs, and generates structured root-cause post-mortems using GPT-4 and Claude.

---

### ⏱️ The 30-Second Pitch

- **What it is**: An AI-native telemetry analytics, distributed APM tracing, and automated incident response platform.
- **Who it is for**: DevOps, SRE, and full-stack engineering teams seeking to minimize downtime.
- **Why it matters**: Reduces pager noise by 98% through dynamic anomaly baseline analysis, pinpoints bottlenecks across microservices via waterfall trace visualizers, and drops MTTR from hours to seconds by correlating deployment commits with telemetry spikes.
- **Why it is unique**: Combines real-time statistical mathematical models (Z-Scores), distributed span flamegraphs, zero-dependency client-side PII scrubbing, and enterprise on-call integrations (PagerDuty, Opsgenie, Jira).

> Datadog shows you everything and explains nothing. **ObservabilityOS shows you what matters and explains it in plain English.**

---

## 🌟 Key Features

- **Distributed APM Tracing & Flamegraph Visualizer (`/dashboard/traces`)**: End-to-end distributed span tracking across microservices with waterfall Gantt charts, span hierarchy inspection, and correlated log tabs.
- **Local PII Redaction (`scrubber.ts`)**: Automatically scrubs passwords, credentials, credit cards, JWTs, and Auth headers from metadata and text fields _before_ telemetry leaves your app.
- **SDK Metrics Auto-Sampler (`@observability-os/sdk`)**: Real-time periodic host and container CPU & memory sampling, latency tracking, and metric batching.
- **Container Log Shipper & Docker Sidecar (`@observability-os/shipper`)**: Zero-dependency CLI agent (`obs-shipper`) and lightweight Alpine Docker sidecar container for streaming Docker JSON, Pino, Winston, Nginx access logs, or STDIN to ObservabilityOS.
- **Automated Data Retention & Lifecycle Management**: Configurable retention thresholds by plan tier (Free: 7 days, Pro: 30 days, Self-Host: unlimited) with automated cron purges and on-demand project storage management.
- **SRE On-Call & Issue Tracking Integrations**: Native alerting into **PagerDuty (Events API v2)**, **Atlassian Opsgenie**, and **Jira Cloud** ticket automation with AI post-mortem attachments.
- **Rolling Z-Score Anomaly Engine (`anomaly.ts`)**: Calculates rolling standard deviations on error rates, latency, and CPU usage. Adapts to weekly/daily traffic cycles to reduce pager noise by 98%.
- **AI Incident Diagnostics**: Processes raw logs and deployment diffs to compile narrative post-mortems explaining "What happened", "Why", and "Suggested hotfix" in under 10 seconds.
- **Multi-channel Alerts**: Delivers rich, markdown-styled incident alerts directly to Slack, Discord, Microsoft Teams, PagerDuty, and Opsgenie.

---

## 📁 Workspace Structure

ObservabilityOS is structured as a **Turborepo monorepo workspace**:

```text
├── apps
│   ├── web                   # Next.js 16 Web Dashboard, APM Waterfall, APIs & Rate Limiters
│   └── docs                  # Next.js Static Documentation Portal
├── packages
│   ├── db                    # Shared Mongoose/MongoDB schemas (Logs, Spans, Metrics, Services)
│   ├── ai                    # Prompt builders, failover models, and LLM diagnostic wrappers
│   ├── sdk                   # Zero-dependency TypeScript logger, metrics & tracer SDK (MIT)
│   ├── shipper               # Standalone container log shipper & Docker sidecar CLI (MIT)
│   ├── typescript-config     # Shared base TSConfig options
│   └── ui                    # Standardized Radix-based shadcn/ui components
├── context                   # System design, product specifications & architectural decisions
└── scratch                   # Local sandbox verification and test scripts
```

---

## 🚀 Quick Start (5-Minute Onboarding)

### 1. Prerequisites

Ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) v18+
- [Yarn](https://yarnpkg.com/) v4.16.0
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local database and cache nodes)

### 2. Boot Infrastructure

Spin up standalone MongoDB and Redis containers instantly:

```bash
docker-compose up -d
```

### 3. Install & Build

Install workspace dependencies and build the shared monorepo packages:

```bash
yarn install
yarn build
```

### 4. Configure Environment

Create a configuration file in `apps/web/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/observability-os
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_token_here
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
```

### 5. Launch Development Servers

Run the dev server:

```bash
yarn dev
```

Open `http://localhost:3000` to access the ObservabilityOS console.

---

## 📦 Ingesting Telemetry

### 1. Node.js / TypeScript SDK

Install the `@observability-os/sdk` package:

```bash
npm install @observability-os/sdk
```

```typescript
import { Logger, Tracer } from "@observability-os/sdk";

const logger = new Logger({
  apiKey: "your_project_api_key",
  endpoint: "https://your-instance.com/api/ingest",
  defaultService: "billing-service",
  defaultEnvironment: "prod",
  enableMetrics: true, // Auto-sample CPU & Memory
  enableTracing: true, // Distributed APM tracing
});

// Structured logs with client-side PII scrubbing
logger.info("Payment processed successfully", {
  metadata: { transactionId: "tx_98124", amount: 49.99 },
});

// Distributed APM Tracing with span context
await logger.withSpan("process-payment", async (span) => {
  span.setAttribute("payment.provider", "stripe");
  await stripe.charges.create({ ... });
});
```

### 2. Container Log Shipper & Docker Sidecar (`obs-shipper`)

Stream logs directly from files, Docker containers, or standard input:

```bash
# Via CLI
npx @observability-os/shipper --api-key obs_sk_xxx --service payment-api --tail /var/log/app.log --enable-metrics

# Via STDIN pipe
docker logs -f my-app | npx @observability-os/shipper --api-key obs_sk_xxx --service my-app --stdin
```

Or deploy as a Docker sidecar using `packages/shipper/docker-compose.sidecar.yml`.

---

## 📚 Documentation System

For in-depth guides and technical details, see the files in the `apps/docs/content/` directory:

- ⏱️ **[QUICKSTART.md](apps/docs/content/QUICKSTART.md)**: Jump right into your first project setup.
- ⚙️ **[INSTALLATION.md](apps/docs/content/INSTALLATION.md)**: Requirements, environment configs, local and production run-times.
- 🏗️ **[ARCHITECTURE.md](apps/docs/content/ARCHITECTURE.md)**: Domain layers, distributed tracing, ingestion pipelines, anomaly loops, and Mermaid diagrams.
- 🔌 **[API.md](apps/docs/content/API.md)**: REST API reference for Ingest, Metrics, Traces, and Data Retention.
- 🗄️ **[DATABASE.md](apps/docs/content/DATABASE.md)**: MongoDB schemas, Spans, Metrics, relationships, indexes, and Redis cache keys.
- 🚀 **[DEPLOYMENT.md](apps/docs/content/DEPLOYMENT.md)**: Production configurations for Vercel, Railway, and Docker environments.
- 🛡️ **[SECURITY.md](apps/docs/content/SECURITY.md)**: OAuth scopes, rate-limiting, and recursive PII scrubbing algorithms.
- 🛠️ **[DEVELOPMENT.md](apps/docs/content/DEVELOPMENT.md)**: Codebase rules, testing framework, workspace tools, and testing commands.
- 🧪 **[TESTING.md](apps/docs/content/TESTING.md)**: Details on unit, contract integration, performance benchmarks, and Playwright E2E tests.
- 🩹 **[TROUBLESHOOTING.md](apps/docs/content/TROUBLESHOOTING.md)**: Solutions to database timeouts, Redis connection refusals, and port conflicts.
- ❓ **[FAQ.md](apps/docs/content/FAQ.md)**: Solutions to common developer questions.
- 🤝 **[CONTRIBUTING.md](apps/docs/content/CONTRIBUTING.md)**: PR workflows, linting, and commit naming conventions.
- 💼 **[RECRUITER_GUIDE.md](apps/docs/content/RECRUITER_GUIDE.md)**: Hiring roadmap detailing system design, complexity highlights, and skills.
- 🗺️ **[ROADMAP.md](apps/docs/content/ROADMAP.md)**: Completed and planned milestones.
- 📜 **[CHANGELOG.md](apps/docs/content/CHANGELOG.md)**: Release logs.

---

## 🤝 Contributing

We welcome contributions from the community! Please read our **[CONTRIBUTING.md](apps/docs/content/CONTRIBUTING.md)** guide to get started.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes following our conventional commits rules
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

ObservabilityOS is licensed under a hybrid licensing model:

- **Core Application & Packages**: Licensed under the **ObservabilityOS Source Available License** (see [LICENSE](LICENSE)). This allows free personal, internal development, and non-SaaS production use, but prohibits offering the platform as a commercial SaaS or managed service.
- **Logger SDK (`packages/sdk`) & Container Shipper (`packages/shipper`)**: Licensed under the highly permissive **MIT License** (see [packages/sdk/LICENSE](packages/sdk/LICENSE)) to allow frictionless integration into any proprietary codebase.

For commercial licenses, custom terms, or SaaS rights, please read [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) or contact support@observabilityos.in.
