# Pulse — Real-Time GT Campus Map

Pulse is a live data portrait of Georgia Tech's campus. It shows bus locations updated every 15 seconds, crowd density heatmaps across dining halls, recreation facilities, and study spots, dining wait-time estimates, and an AI assistant (Ask Pulse) that helps you decide where to go based on current conditions. An Events tab aggregates campus events from GT Involvement Link, Eventbrite, and the GT Registrar — including a finals schedule callout during exam periods.

## Tech Stack

- **Next.js 16** (App Router, server components)
- **Google Maps JavaScript API** (heatmap visualization, Directions API for bus routes)
- **TransLoc / GT Buses API** — live bus positions
- **Open-Meteo** — real-time weather
- **Eventbrite API** — local event search
- **Anthropic Claude API** (claude-sonnet-4-6) — AI campus assistant + event parsing
- **Apify** — Instagram scraper for social events (optional)
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) — enable Maps JS API + Directions API |
| `EVENTBRITE_API_KEY` | [eventbrite.com/platform/api](https://www.eventbrite.com/platform/api) |
| `APIFY_API_TOKEN` | [apify.com](https://apify.com) (optional — for social events) |

## Run Locally

```bash
git clone https://github.com/armaan-k019/pulse-gt
cd pulse-gt
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
# Navigate to http://localhost:3000/projects/pulse
```

## How It Works

Crowd density is modeled from class schedules and historical patterns, updated every 10 seconds via the `/api/pulse` route which also pulls live weather from Open-Meteo. Bus positions are fetched from the GT Stinger bus system every 15 seconds and rendered as labeled SVG markers on the map, with road-snapped polylines drawn via the Google Directions API. Events are fetched in parallel from three sources (GT Involvement Link, Eventbrite, and the GT Registrar) and deduplicated by title before being displayed in the sidebar and pinned on the map.

## Screenshots

Screenshots coming soon.
