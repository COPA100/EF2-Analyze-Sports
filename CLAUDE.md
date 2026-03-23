# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

C4K Tabletop Basketball Analysis Tool — a data collection and post-game analysis app for a physical tabletop basketball game with 6 shooting zones. Students record shots and analyze performance via heatmaps and dashboards.

## Commands

- **Dev server:** `npm run dev`
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint:** `npm run lint`
- **Preview production build:** `npm run preview`

## Tech Stack

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, imported as `@import "tailwindcss"` in `src/index.css`)
- Firebase Firestore for backend/database
- Firebase config uses `VITE_FIREBASE_*` env vars loaded via `import.meta.env` (see `.env`)

## Architecture

This is an early-stage project. Current structure:

- `src/main.tsx` — React entry point (StrictMode, renders `<App />`)
- `src/App.tsx` — Root component (currently placeholder)
- `src/index.css` — Tailwind import
- `firebase.js` — Firebase initialization (reads env vars, exports app instance)
- `context.md` — Full domain requirements, game rules, and UI/UX specs
- `dbschema.txt` — Simplified Firestore schema reference

## Domain Rules

The app tracks shots for two activity types:

- **Individual Play:** 20 shots per player; cannot shoot from same zone twice in a row
- **Team Play:** 30 shots per team; no player > 15 shots, no player < 5 shots

Zones 1-6 have different point values: Zone 1 = 1pt, Zones 2-3 = 2pts, Zones 4-6 = 3pts.

## Firestore Collections

- `users` — player profiles with `playerId`
- `shots` — individual shot records with `gameId`, `playerId`, `result` (make/miss), `shotFrom` (1-6)
- `gameSessions` — game metadata with player arrays, timestamps, and denormalized stats

See `context.md` for the full schema with all fields and `dbschema.txt` for the simplified version.

## Notes

- Firebase config env vars are prefixed with `VITE_` (required by Vite for client-side access)
- The `.env` file is in `.gitignore` but was committed historically — do not re-commit it
- No test framework is configured yet
- No routing library installed yet

## gstack

For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
- `/office-hours` — Office hours
- `/plan-ceo-review` — Plan CEO review
- `/plan-eng-review` — Plan engineering review
- `/plan-design-review` — Plan design review
- `/design-consultation` — Design consultation
- `/review` — Code review
- `/ship` — Ship code
- `/land-and-deploy` — Land and deploy
- `/canary` — Canary deployment
- `/benchmark` — Benchmark
- `/browse` — Web browsing (use this instead of mcp__claude-in-chrome__* tools)
- `/qa` — QA testing
- `/qa-only` — QA only
- `/design-review` — Design review
- `/setup-browser-cookies` — Setup browser cookies
- `/setup-deploy` — Setup deploy
- `/retro` — Retrospective
- `/investigate` — Investigate issues
- `/document-release` — Document release
- `/codex` — Codex
- `/cso` — CSO
- `/autoplan` — Auto-planning
- `/careful` — Careful mode
- `/freeze` — Freeze deployments
- `/guard` — Guard mode
- `/unfreeze` — Unfreeze deployments
- `/gstack-upgrade` — Upgrade gstack
