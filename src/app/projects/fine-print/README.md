# Fine Print — AI Document Analyzer

Fine Print is an adversarial document analyzer. Paste any rule-based text — board game rules, contracts, terms of service, apartment leases, company policies — and Claude systematically identifies ambiguities, edge cases, and exploitable gaps. Optionally describe your specific situation so the AI can prioritize the most relevant loopholes. Tone adapts automatically: playful for game rules, precise for legal documents.

## Tech Stack

- **Next.js 16** (App Router)
- **Anthropic Claude API** (claude-sonnet-4-6) — loophole detection and analysis
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

## Run Locally

```bash
git clone https://github.com/armaan-k019/fine-print
cd fine-print
npm install
cp .env.example .env.local
# Fill in your ANTHROPIC_API_KEY in .env.local
npm run dev
# Navigate to http://localhost:3000/projects/fine-print
```

## How It Works

The document text and optional context are posted to `/api/fine-print`, which streams a Claude response using a system prompt that instructs the model to act as a sharp legal and logical analyst. Results are numbered, ranked by exploitability, and displayed with severity tags. The streaming response means findings appear progressively rather than waiting for the full analysis to complete.

## Screenshots

Screenshots coming soon.
