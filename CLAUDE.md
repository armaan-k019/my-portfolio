# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # next dev --webpack (not Turbopack)
npm run build    # next build
npm run start    # serve the production build
npm run lint     # eslint (flat config, eslint.config.mjs)
npx tsc --noEmit # typecheck. There is no npm script for this; run it directly.
```

There is no test runner in this repo. "Verified" means `npx tsc --noEmit` is clean and `npm run build` succeeds. If `tsc` reports errors only inside `.next/`, delete that directory and rerun before trusting the output; it is a generated cache and goes stale after routes are added or removed.

Local setup: `cp .env.example .env.local`, fill the keys, `npm run dev`.

One maintenance script:

```bash
node scripts/generate-preloaded-worlds.mjs            # regenerate cached Marble worlds
node scripts/generate-preloaded-worlds.mjs --only babel,diomira
node scripts/generate-preloaded-worlds.mjs --force
```

It calls Claude for a spatial reading of each text in `src/app/demos/world-labs/preloaded-texts.ts`, sends the prompt to the World Labs Marble API, polls until the world is built (5 to 10 minutes, texts run in parallel), and rewrites `preloaded-worlds.ts`. It costs real Marble credits. Do not run it casually.

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, deployed on Vercel. See `AGENTS.md`: this Next.js version departs from older conventions, so read `node_modules/next/dist/docs/` before writing framework code.

Four content systems feed the site, and knowing which one owns a page saves a lot of searching:

1. **`content/*.ts`** holds hand written TypeScript data modules (`projects.ts`, `work.ts`, `photos.ts`, `photography.ts`). `content/projects.ts` is the registry that drives the projects index and the `/projects/[slug]` fallback renderer. A project appears on the site only if it has an entry here. It currently lists two: Archipedia (external link, no local page) and UrbanGPT.
2. **`content/blog/*.mdx` and `content/research/*.mdx`** are frontmatter driven MDX, read at build time through `src/lib/mdx.ts` (`gray-matter` plus `next-mdx-remote`). Adding a file is enough. There is no index to update.
3. **`src/app/projects/<slug>/page.tsx`** are bespoke project pages that override the generic `[slug]` renderer. `fine-print` and `yield` are examples: routable, but absent from `content/projects.ts`, so unlisted on the projects index.
4. **`src/app/demos/<slug>/`** are self contained recruiter facing demos, each with its own page, client components, and usually its own API route under `src/app/api/demos/<slug>/`.

### Demo access model

Two separate mechanisms, easy to confuse:

- **Public demo cards.** `src/app/demos/page.tsx` holds a hardcoded `demoCards` array. This array, not `src/lib/demos.ts`, decides what is listed publicly. Currently: World Labs, Illoca, Rho, Midjourney.
- **Access code demos.** `src/lib/demos.ts` maps a code string to a `DemoConfig`. Entering a code on `/demos` either renders an inline `DemoView` from `sections`, or redirects to `url`. Current codes: `mayodentalkeer`, `midjourney`, `terranox_2026`, `whop_2026`, `demo123`. Codes are client side and deliberately not secure, as the file comments say. Never put anything sensitive behind one.
- Terranox and Whop have pages under `src/app/demos/` but no public card; they are reachable only through their access code, which is the intended state after the portfolio focus cuts. Midjourney is unusual in having both a public card and an access code that redirects to the same page.

### API routes

All AI calls go server side through `src/app/api/`. Routes use the `@anthropic-ai/sdk` directly and each exports `maxDuration` at the top of the file (15, 30, or 60) because these are long running Vercel functions. Every route currently on `claude-sonnet-4-6`; match that when adding one.

Prompts and their JSON response contracts are inline in the route files. Several routes parse model output as JSON, so changing a prompt means checking the parser directly below it.

### Styling

Tailwind v4 with an `@theme inline` block at the top of `src/app/globals.css`. Design tokens and shared primitives live there, not in a config file. The aesthetic is elevated architectural: Fraunces as the display serif (`.font-display`, `.display-xl/lg/md`), IBM Plex Mono as the metadata layer (`.eyebrow`, `.meta`, `.coord`), Inter for body. Reuse the existing primitives (`.card`, `.eyebrow`, `.rule`, `.hairline`, `.tick-rule`, `.prose`) rather than inventing new one off classes.

`src/app/layout.tsx` wraps every page in ambient chrome: `IsometricBackground`, `AtlasFrame`, `CustomCursor`, `DrawingAwareScope`. Changes there affect every route.

### Heavy client dependencies

The repo carries Three.js, Leaflet, rhino3dm, and web-ifc for individual demos. `next.config.ts` enables async WebAssembly and disables `fs`/`path` fallbacks client side. Import these libraries dynamically inside the demo that needs them. Do not hoist them into shared code.

## Environment variables

Only three are read anywhere in the codebase:

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | Every AI backed route. |
| `WORLDLABS_API_KEY` | World Labs / Ekphrasis routes and the world generation script. |
| `RESEND_API_KEY` | Contact and feedback form. |

`.env.example` still lists a fourth, `EVENTBRITE_API_KEY`, but nothing in the codebase reads it anymore; the route that used it (Pulse events feed) was removed in the portfolio focus cuts. Treat `.env.example` as slightly stale rather than as ground truth, and grep `process.env` before trusting either file.

## Working preferences

**No em dashes anywhere.** Not in code, comments, prose, commit messages, PR descriptions, or generated content. Use periods, commas, colons, or parentheses.

**File path scoping is expected.** Restrict changes to the paths named in the request. No "while I am here" edits to files outside the stated scope.

**Per step commits with per step verification.** A multi part task produces multiple commits, not one. After each commit, confirm only the expected files changed:

```bash
git diff --name-only main
```

**Verify after each change.** `npx tsc --noEmit` clean and `npm run build` succeeding before any work is called done.

**Anti fabrication.** Never invent code, stack claims, screenshots, or feature descriptions that do not reflect what is actually in the repo. Descriptions of demos and projects must match the code. If unsure, ask instead of guessing. This applies with extra force to demo corpora (Illoca precedents, World Labs texts): every entry gets verified individually against a real source, never generated in bulk from memory.

**Stop and ask tripwires.** Stop and ask before proceeding if a change would touch more than 15 to 20 files outside its stated scope, delete tracked content, or alter `src/app/layout.tsx` or `src/app/globals.css` as a side effect of unrelated work.

**Local and remote drift.** Before trusting `git log main` or the working tree as "current state," run `git fetch origin` and compare `main` to `origin/main`. This repo has previously diverged: a local commit sat unpushed while two PRs merged upstream, so the working tree and `git log` both reflected a stale state for several days.

## Skill routing

| Task | Use |
|---|---|
| Delete orphan API routes, dead code, stale files | `/simplify` |
| Delete unused env vars, or determine whether they are used | `/simplify` with explicit scope |
| Audit env vars without deleting | Read only prompt, no skill needed |
| Add a new env var or change config | `/update-config` |
| Security audit of routes and secrets | `/security-review` |
| Review a PR before merging | `/code-review` |
| Regenerate this file | `/init` |
| Create a skill for a repeated workflow | `/skill-creator` |

## Known repo debris

- `.env.example` documents `EVENTBRITE_API_KEY`, which is no longer read anywhere. Worth removing in a future cleanup pass.
- `src/lib/` contains modules whose consumers may no longer exist. Confirm usage with a grep before assuming a file is live.
- Several bespoke project pages under `src/app/projects/` (`fine-print`, `yield`) have no entry in `content/projects.ts`, so they are unlisted but still routable. This may be intentional; confirm before adding one to the index.
