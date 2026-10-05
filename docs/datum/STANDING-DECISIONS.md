# Standing decisions for the Datum build

Set by the owner on 2026-09-25. The orchestrator and every subagent follow these for the rest of
the build. They sit above the phase files; a phase file may be stricter, never looser.

## Decide without asking

- Implementation approach within a phase, as long as SPEC's behaviour is met.
- File layout, naming, internal structure.
- Refactors confined to files the current phase already touches.
- Adding tests, fixtures and assertions.
- Fixing bugs found in code this build owns.
- Up to two fix rounds per phase in response to review findings.

## Stop and ask, always

- Merging anything to main.
- Deploying to production.
- Weakening, skipping, deleting or loosening any test or acceptance criterion, for any reason.
- Anything irreversible: git stash, reset, checkout of another branch, force push, history
  rewriting, deleting tracked files.
- A database migration that drops or rewrites existing data.
- Adding, removing or upgrading a dependency.
- Spending money: paid APIs, new services, anything with a bill.
- A product decision: what a feature should do, as opposed to how it does it.
- Anything a user sees: copy, layout, visual design, error text.
- Touching secrets, env var configuration, or Vercel project settings.
- Any work outside this repo.
- Anything not in SPEC.

On a stop and ask: do not idle. Write the question to PROGRESS.md, continue on any unblocked
work, and report the question at the next checkpoint.

## Autonomy

Run continuously from the close of Phase 2 through Phase 3 and the final review. Stop only on a
tripwire above or when the work is done.

Resume protocol: PROGRESS.md is updated after every phase, every fix round, and every stop and
ask, with enough state for a cold session to resume without the transcript: current phase and
step, what is done and verified, what is in flight, every open question, every decision made and
why, and the exact next action. PROGRESS.md is the only thing that survives the session.

Greptile: after opening each phase PR, wait for Greptile's review, address or reply to every
comment, record the outcome in PROGRESS.md, escalate only findings on the stop and ask list.

Self review: before opening each phase PR, an independent reviewer with fresh context reviews the
diff. Two fix rounds maximum, then report what is left.

Honesty: never report work as delivered that is not delivered. Partial is reported as partial. A
measurement not taken is reported as not taken, never estimated.

## Constraints carried forward, non negotiable

- Never print env values or keys, in logs, output, reports or commit messages.
- Secrets live only in .env.local and the Vercel dashboard. Never in chat, prompts, tests or
  fixtures.
- SUPABASE_SECRET_KEY is server only. Never prefixed NEXT_PUBLIC_.
- RLS stays enabled on every Supabase table, with no policies.
- Datum never stores the raw typed address. Only the geocoded point and a coarse locality.
- Anti fabrication covers data as well as code: no estimated building heights, no default values
  presented as fetched values, no source shown as available when it failed.
- No em dashes anywhere, including commit messages and PR bodies.
- Verified means `npx tsc --noEmit` clean and `npm run build` succeeds (and, since Phase 0,
  `npx next build --webpack` too), plus the acceptance commands in the phase file. If tsc errors
  only inside .next/, delete it and rerun.
- `git fetch origin` and compare main to origin/main before trusting the tree.

## CLI

Allowed freely: Vercel CLI, Supabase CLI and gh for read operations and for preview deploys.
Never: any production deploy, any destructive Supabase command (db reset, db push that drops,
project delete), gh pr merge, gh release, any command that prints a secret, any git command on the
no list above. A CLI command that needs a credential the orchestrator does not have is a stop and
ask, not a workaround.
