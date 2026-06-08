# Spike: persistent canvas in the root layout

Date: 2026-06-08. Branch: latent-atlas-v2.

## Why
The Latent Atlas traversal model requires a single WebGL canvas that survives
client side route changes, so the camera can fly continuously from one page to
the next rather than remounting per route. This spike verified that a component
mounted in the root `layout.tsx`, as a sibling to the page children, persists
across navigation in both dev and a production build.

## Method
A temporary `Spike` component was mounted in `src/app/layout.tsx`. It ran a
`requestAnimationFrame` frame counter and held a stable per instance id
(`useState` initializer). A sibling read `usePathname()`. A throwaway Playwright
run (not added to `package.json`) drove a real client navigation on the
production server (`npm run build && npm run start`): load `/`, click the
navbar link to `/photography`, then browser Back.

## Result: PASS
Observed values:

| checkpoint | frames | instanceId | path |
| --- | --- | --- | --- |
| load `/` | 1 | u2dyev | / |
| `/` after 900ms | 108 | u2dyev | / |
| after nav to `/photography` | 165 | u2dyev | /photography |
| after Back | 191 | u2dyev | / |

- instanceId constant across all navigations: the layout component never remounted.
- Frame counter strictly increasing across both navigations: the rAF loop was never cancelled or reset.
- `usePathname()` updated in the sibling on every route change, matching `location.pathname`.
- SSR intact: raw HTML for both `/` and `/photography` contained the real page content (verified via fetch against the production server).
- Production build succeeded. Behavior matched between dev and prod.

## Notes for the build
- The persistent canvas mounts in the root layout. `src/app/template.tsx`
  (the RELOCATING transition) re-runs per navigation as expected and does not
  remount the layout, so the canvas is unaffected.
- Conclusion: mount the Atlas WebGL canvas once in the root layout. The camera
  follows `usePathname()` changes. Safe to proceed to Phase 1.
