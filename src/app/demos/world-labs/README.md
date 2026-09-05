# Ekphrasis (World Labs demo)

Text in, a walkable Marble world out, with Claude's spatial reading in between.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/demos/world-labs/extract-dna` | Sonnet call that produces the spatial DNA, annotations, and the Marble prompt. |
| `WORLDLABS_API_KEY` | `api/demos/world-labs/generate-world`, `api/demos/world-labs/world-status` | World API key from https://platform.worldlabs.ai/api-keys. Needs API credits bought at https://platform.worldlabs.ai/billing (separate from Marble app credits). |

Both keys are read server side only. If either is missing the routes return a
502 with a plain message and the page degrades: the reading still renders
without a world, or the world panel shows an unavailable notice.

## Files

- `page.tsx`: the demo page.
- `preloaded-texts.ts`: six verified texts. Do not edit an excerpt without
  re-checking it against the source named in `attribution_notes`.
- `preloaded-worlds.ts`: cached world ids per preloaded text. See the comment
  at the top for how to populate it.
- `scripts/generate-preloaded-worlds.mjs` (repo root): one time script that generates the cached worlds and writes `preloaded-worlds.ts`.
- `types.ts`: shared types.

## Marble API shape used

- `POST https://api.worldlabs.ai/marble/v1/worlds:generate` with header
  `WLT-Api-Key`, body `{ display_name, model, world_prompt: { type: "text", text_prompt } }`.
  Returns `{ operation_id, done, ... }`.
- `GET https://api.worldlabs.ai/marble/v1/operations/{operation_id}` until
  `done` is true. `response.world_marble_url` is the viewer page,
  `response.assets.thumbnail_url` the poster image.
- Models: `marble-1.0-draft` (150 credits, fastest), `marble-1.1` (1,500 credits).
