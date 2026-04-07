# UrbanGPT — Urban Analysis Dashboard

UrbanGPT is a site-intelligence tool for architects and urban designers. Enter any address and a search radius, and it pulls amenity data from OpenStreetMap via the Overpass API across five categories (food, transit, parks, education, healthcare), then passes the counts to Claude for design-relevant analysis. The result is a narrative insight — population context, walkability read, and design implications — alongside a live map with color-coded amenity pins.

## Tech Stack

- **Next.js 16** (App Router)
- **Google Maps JavaScript API** — map display and Places Autocomplete
- **Overpass API** (OpenStreetMap) — amenity and POI data
- **Anthropic Claude API** (claude-sonnet-4-6) — urban analysis narrative
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) — enable Maps JS API + Places API |

Overpass API is free and requires no key.

## Run Locally

```bash
git clone https://github.com/armaan-k019/urban-gpt
cd urban-gpt
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
# Navigate to http://localhost:3000/projects/urban-gpt
```

## How It Works

When a user selects an address from the autocomplete, five parallel Overpass QL queries run with `Promise.allSettled` — one per amenity category — each capped at 50 results and timed out independently at 27 seconds to avoid blocking the response. Results are tallied and passed to Claude with a 30-second server timeout (`maxDuration = 30`). The map zoom level is set dynamically from the search radius so the selected area always fills the viewport.

## Screenshots

Screenshots coming soon.
