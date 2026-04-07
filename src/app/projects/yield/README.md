# Yield — Stock Portfolio Analyzer

Yield is a live report card for your stock portfolio. Enter your holdings (ticker + share count), and it fetches real-time prices via Yahoo Finance, then uses Claude to generate a structured grade across five dimensions: overall grade, diversification, volatility profile, market-cap mix, and day performance. Each dimension comes with a letter grade and a plain-English explanation so you know exactly what the AI saw.

## Tech Stack

- **Next.js 16** (App Router)
- **Yahoo Finance 2** — real-time stock quotes and metadata
- **Anthropic Claude API** (claude-sonnet-4-6) — portfolio analysis and grading
- **Recharts** — performance and allocation charts
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

Yahoo Finance data is fetched directly — no additional API key required.

## Run Locally

```bash
git clone https://github.com/armaan-k019/yield
cd yield
npm install
cp .env.example .env.local
# Fill in your ANTHROPIC_API_KEY in .env.local
npm run dev
# Navigate to http://localhost:3000/projects/yield
```

## How It Works

Holdings are posted to `/api/yield`, which calls `yahoo-finance2` in parallel for each ticker to retrieve quote data (price, day change, market cap, beta). The raw data is passed to Claude with a structured system prompt requesting a JSON grade report. A ticker autocomplete endpoint (`/api/search-ticker`) queries Yahoo Finance's search API to help users find valid tickers without leaving the page.

## Screenshots

Screenshots coming soon.
