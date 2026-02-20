# Guardx

**Independent, verifiable security auditor for applications running inside Trusted Execution Environments on EigenCloud.**

EigenCloud proves _where_ code runs. **Guardx proves _whether_ that code is safe.**

Guardx consumes Eigen's AppController and ReleaseManager on-chain contracts, reconstructs the exact Docker image that was executed, and performs an AI-powered security audit on that image. The result is a signed, reproducible security verdict that anyone can independently verify.

This closes a critical trust gap in verifiable compute: even if a TEE guarantees code integrity, someone still needs to answer _"is the code inside worth trusting?"_

---

## How It Works

```
Eigen Verify Link
       │
       ▼
┌──────────────┐     on-chain      ┌─────────────────────┐
│  AppController│ ──────────────▶  │   ReleaseManager    │
│  (get operator│                  │   (getLatestRelease) │
│   set ID)     │                  │   → registry + digest│
└──────────────┘                   └──────────┬──────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Docker Registry API │
                                   │  (fetch manifest +   │
                                   │   layer blobs)       │
                                   └──────────┬──────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Layer Selection     │
                                   │  (AI picks app layer)│
                                   └──────────┬──────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Code Extraction     │
                                   │  (entry point +      │
                                   │   import tracing)    │
                                   └──────────┬──────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼                               ▼
                   ┌───────────────────┐           ┌───────────────────┐
                   │  Security Audit   │           │  Chat Agent       │
                   │  (AI analysis)    │           │  (conversational  │
                   │                   │           │   code Q&A)       │
                   └────────┬──────────┘           └────────┬──────────┘
                            │                               │
                            ▼                               ▼
                   ┌─────────────────────────────────────────────────┐
                   │           Cryptographic Attestation              │
                   │  (EIP-191 signed verdict with content hash)     │
                   └─────────────────────────────────────────────────┘
```

## Features

### Security Audit

- **Mnemonic exposure detection** — finds logging, network sends, debug endpoints that could leak the TEE-injected mnemonic
- **Wallet usage analysis** — identifies fund withdrawal capability and arbitrary signing risks
- **Environment variable inventory** — classifies every `process.env.*` by sensitivity (CRITICAL/HIGH/MEDIUM/LOW)
- **Admin exploitation path tracing** — maps flows where an operator could exfiltrate funds or data
- **Structured JSON output** with severity ratings and actionable recommendations

### Chat & Analyze

- **Conversational AI agent** — ask follow-up questions about any app's code running in a TEE
- **Full code context injection** — the agent sees the same extracted code the audit analyzes
- **Multi-turn conversation history** — maintains context across questions

### Verifiable Verdicts

- Every API response is signed with a mnemonic-derived key (injected by Eigen KMS at deploy time)
- Attestations include signer address, SHA-256 content hash, timestamp, and EIP-191 signature
- Anyone can independently verify that a verdict came from a specific Guardx instance inside a TEE

---

## Project Structure

```
├── src/
│   ├── server.ts           # Express API server
│   ├── contracts.ts         # Eigen AppController + ReleaseManager integration
│   ├── networks.ts          # Network config (Sepolia, Mainnet) + ABIs
│   ├── registry.ts          # Docker Registry API v2 client
│   ├── types.ts             # OCI / Docker manifest type definitions
│   ├── explore.ts           # Image exploration orchestration engine
│   ├── layer-selector.ts    # AI-powered layer selection
│   ├── layer-contents.ts    # Tar extraction and code file discovery
│   ├── layers.ts            # Layer metadata extraction
│   ├── config.ts            # Image config parsing (CMD, WORKDIR, history)
│   ├── cmd-utils.ts         # CMD/Entrypoint → entry script resolution
│   ├── import-tracer.ts     # Import dependency tracing (JS/TS, Python, Go)
│   ├── analysis.ts          # AI security audit engine
│   ├── chat.ts              # AI chat agent
│   └── attest.ts            # Cryptographic response attestation
├── web/
│   └── src/
│       ├── app/
│       │   ├── page.tsx     # Main page (input + tabs)
│       │   ├── layout.tsx   # Root layout with fonts + theme
│       │   └── globals.css  # Terminal-aesthetic theming
│       ├── components/
│       │   ├── AnalysisTab.tsx      # Security audit results display
│       │   ├── ChatTab.tsx          # Chat interface with markdown
│       │   ├── AttestationInfo.tsx   # Attestation detail popover
│       │   └── ThemeToggle.tsx       # Dark/light mode toggle
│       ├── context/
│       │   └── ThemeContext.tsx       # Theme state provider
│       └── lib/
│           └── api.ts                # Backend API client
├── Dockerfile              # Multi-stage production build
├── Caddyfile               # HTTPS reverse proxy config
├── package.json            # Backend dependencies
└── tsconfig.json           # TypeScript configuration
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- An [Alchemy API key](https://www.alchemy.com/) (for Ethereum RPC)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd guardx

# Install backend dependencies
npm install

# Install frontend dependencies
npm install --prefix web

# Configure environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY and ALCHEMY_API_KEY
```

### Development

```bash
# Run the backend API server
npm run dev

# In another terminal, run the frontend
npm run web
```

The backend runs on `http://localhost:3000` and the frontend on `http://localhost:3001`.

### Usage

1. Open `http://localhost:3001` in your browser
2. Paste an Eigen Verify link (e.g., `https://verify-sepolia.eigencloud.xyz/app/0x...`)
3. Click **ANALYZE** to run the security audit
4. Switch to the **Chat** tab to ask questions about the code

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/analysis/by-app/:network/:appId` | Run security audit by Eigen app address |
| `POST` | `/chat/by-app/:network/:appId` | Chat about app code (body: `{ message, history }`) |
| `GET` | `/health` | Health check |

### Production Build

```bash
# Build backend
npm run build

# Build frontend
npm run web:build

# Or use Docker
docker build -t guardx .
docker run -p 3000:3000 --env-file .env guardx
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI analysis and chat |
| `ALCHEMY_API_KEY` | Yes | Alchemy API key for Ethereum RPC calls |
| `MNEMONIC` | No | Mnemonic for signing responses (set by Eigen KMS in production) |
| `PORT` | No | Server port (default: 3000) |
| `OPENAI_MODEL` | No | Override the OpenAI model (default: gpt-5.2 for analysis, gpt-5-mini for chat) |
| `DC_EXPLORER_LEGACY_LAYER` | No | Set to `1` to use legacy "npm run build" layer selection |

---

## License

MIT
