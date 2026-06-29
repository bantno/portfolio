# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Brian Epstein's personal robotics/controls portfolio — a static Astro site deployed to GitHub Pages.

## Commands

- `npm run dev` — local dev server (Astro, default http://localhost:4321/portfolio)
- `npm run build` — static build to `dist/`
- `npm run preview` — serve the production build locally

There is no test suite, linter, or formatter configured. `npm run build` (which runs `astro check`-level type validation against the content schema) is the closest thing to a CI gate.

## Architecture

Astro 5 static site (`output: "static"`) with React 19 islands and an MDX content collection. TypeScript is in strict mode.

**Content-driven projects.** Each project is one `.mdx` file in `src/content/projects/`. Frontmatter is validated against the Zod schema in `src/content.config.ts` — adding a project means adding an MDX file whose frontmatter matches that schema (required: `title`, `summary`, `status`, `domain`, `tags`, `order`, `tier`, `date_range`, and 2–3 `metrics`). Editing the schema changes what every project file must provide.

**Routing by tier.** `src/pages/projects/[...slug].astro` calls `getStaticPaths()` over the collection but **filters out `tier: "brief"`** projects — brief-tier entries appear on the homepage grid only and have no detail page. `tier: "flagship"` projects additionally get a sticky section sub-nav hardcoded in `ProjectLayout.astro` (Motivation / Design / Flight Planning / Prototype / Publications), so flagship MDX should use matching `id=` anchors.

**Layout chain.** `Base.astro` (html shell + global CSS import) → `Nav` / `ProjectLayout.astro` (project header rendered from frontmatter props) → MDX `<Content />` slot. The homepage (`index.astro`) reads the whole collection, sorts by `order`, and renders the project grid.

**React islands.** Interactive visualizations live in `src/components/react/*.tsx` (e.g. `ExplodedAssembly`, `RRTVisualizer`, `MDPDemo`, `FlightTrajectory`, `AnnotatedFigure`). They are imported into MDX and hydrated with `client:visible`. Their data comes from JSON files in `src/data/` imported in the MDX frontmatter and passed as props. `.astro` components in `src/components/` (Figure, Gallery, Video, ResultProof, BeforeAfter, etc.) are server-rendered and need no client directive.

**Styling.** A single global stylesheet `src/styles/global.css` defines all design tokens as CSS custom properties (`--color-*`, `--font-*`, `--space-*`, `--radius*`) on `:root`. Component-scoped styles use Astro `<style>` blocks that reference these tokens. Keep new styling consistent with the token system rather than hardcoding values.

## Critical: base path for assets

The site is served under a sub-path (`base: "/portfolio"` in `astro.config.mjs`), so **raw absolute asset URLs like `/images/foo.png` break in production.** Everywhere an asset/link is referenced from `.astro` or `.tsx`, prefix it with the base:

```js
import.meta.env.BASE_URL.replace(/\/$/, '')   // e.g. `${BASE}/images/hero.jpg`
```

In MDX, this is exposed as `export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')` and passed to components (e.g. `basePath={basePath}`). Static files live in `public/` (served at the base path root). When `astro.config.mjs` `site`/`base` change, the deploy URL changes too.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main` (Node 22, `npm ci` → `npm run build` → upload `dist/`). No manual deploy step.
