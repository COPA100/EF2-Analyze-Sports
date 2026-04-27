# C4K Tabletop Basketball Analysis Tool

A data-collection and post-game analysis web app for a physical **tabletop basketball game** with 6 shooting zones. Designed for classroom and after-school programs so a single laptop at each table can quickly capture shot data from many students and visualize performance with heatmaps, leaderboards, and per-zone accuracy charts.

> This README walks you end-to-end: clone the repo, stand up your own Firebase project, configure environment variables, run the app locally, and deploy it to the public web.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Game Rules & Scoring](#game-rules--scoring)
4. [Prerequisites](#prerequisites)
5. [Quick Start](#quick-start)
6. [Firebase Setup (Step by Step)](#firebase-setup-step-by-step)
   - [Create the Firebase project](#1-create-the-firebase-project)
   - [Add a Web App and get your config](#2-add-a-web-app-and-get-your-config)
   - [Enable Firestore](#3-enable-firestore)
   - [Configure Firestore security rules](#4-configure-firestore-security-rules)
   - [Create the `.env` file locally](#5-create-the-env-file-locally)
7. [Running the App Locally](#running-the-app-locally)
8. [Project Structure](#project-structure)
9. [Routes / Pages](#routes--pages)
10. [Firestore Schema](#firestore-schema)
11. [Building for Production](#building-for-production)
12. [Deploying](#deploying)
    - [Option A: Firebase Hosting (recommended)](#option-a-firebase-hosting-recommended)
    - [Option B: Vercel](#option-b-vercel)
    - [Option C: Netlify](#option-c-netlify)
    - [Option D: Any static host](#option-d-any-static-host)
13. [Environment Variables Reference](#environment-variables-reference)
14. [Troubleshooting](#troubleshooting)
15. [Security Notes](#security-notes)
16. [Contributing](#contributing)
17. [License](#license)

---

## Features

- **Two activity modes:** Individual Play (20 shots/player) and Team Play (30 shots/team, 2 teams).
- **Fast ID entry:** one laptop, many students — quick autocomplete-style player ID lookup.
- **3x3 zone grid input** matching the physical court layout: Zone 1 across the top, Zones 2/3 in the middle row, Zones 4/5/6 across the bottom.
- **Make/Miss toggle** with a single tap per shot — minimum clicks to keep up with table speed.
- **Rule enforcement:** can't shoot from the same zone twice in a row (Individual); per-player min/max shot caps (Team).
- **Session locking + resume:** games only register on completion, with a session lock so two recorders don't double-write.
- **Live stats panel** during play.
- **Post-game dashboard:** zone heatmap, points per zone, per-player accuracy, team totals, and Individual leaderboard.
- **Seed page** for generating randomized demo data so you can test the dashboard without playing real games.

## Tech Stack

- **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin — imported as `@import "tailwindcss"` in `src/index.css`)
- **React Router v7** for client-side routing
- **Recharts** for charts and graphs
- **Firebase Firestore** for the database

## Game Rules & Scoring

| Zone | Position | Points |
|------|----------|--------|
| 1 | Top row (full width) | 1 |
| 2 | Middle-left | 2 |
| 3 | Middle-right | 2 |
| 4 | Bottom-left | 3 |
| 5 | Bottom-center | 3 |
| 6 | Bottom-right | 3 |

**Individual Play** — 20 shots per player. Cannot shoot from the same zone twice in a row (the UI disables the previously selected zone).

**Team Play** — 30 shots per team. No player may take more than 15 shots and no player may take fewer than 5. The app rotates turns between teams and forces under-quota players to shoot when the math requires it.

---

## Prerequisites

Install these before you start:

- **[Node.js 20.x or newer](https://nodejs.org/en/download)** (npm comes bundled).
  - Verify with `node -v` and `npm -v`.
- **[Git](https://git-scm.com/downloads)** for cloning the repo.
- A **Google account** (free, used to create your Firebase project).
- Optional: the **[Firebase CLI](https://firebase.google.com/docs/cli)** if you plan to deploy via Firebase Hosting:
  ```bash
  npm install -g firebase-tools
  ```

---

## Quick Start

For experienced users in a hurry. Newcomers should follow the full [Firebase Setup](#firebase-setup-step-by-step) below.

```bash
# 1. Clone
git clone https://github.com/<your-username>/EF2-Analyze-Sports.git
cd EF2-Analyze-Sports

# 2. Install
npm install

# 3. Create .env from your Firebase web app config (see below)
cp .env.example .env   # then edit .env with your real values

# 4. Run
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Firebase Setup (Step by Step)

This app needs **its own Firebase project**. The project's `.env` is in `.gitignore` and you must supply your own keys.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add project**.
3. Give it a name (e.g. `tabletop-basketball-c4k`). Accept the default project ID or customize it.
4. Choose whether to enable Google Analytics — it's optional for this app. If you skip Analytics you can leave `VITE_FIREBASE_MEASUREMENT_ID` blank later.
5. Wait for the project to finish provisioning, then click **Continue**.

### 2. Add a Web App and get your config

1. In your new project's dashboard, click the **`</>` (Web)** icon under "Get started by adding Firebase to your app".
2. Give the app a nickname (e.g. `c4k-web`). You do **not** need to set up Firebase Hosting at this step — you can do that later.
3. Click **Register app**.
4. Firebase will display a `firebaseConfig` object that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123",
     measurementId: "G-XXXXXXXX"   // only if Analytics enabled
   };
   ```
5. **Copy these seven values somewhere safe** — you'll paste them into your `.env` file in step 5.
6. You can revisit them anytime under **Project Settings → General → Your apps → SDK setup and configuration**.

### 3. Enable Firestore

1. In the Firebase Console, open the **Build → Firestore Database** menu item.
2. Click **Create database**.
3. Choose a location close to your users (this can't be changed later — pick a region near where the app will be used most).
4. For initial setup, choose **Start in test mode**. This lets the app read/write freely for 30 days while you prototype.

   > **Important:** test mode is **not** safe for production. See [Configure Firestore security rules](#4-configure-firestore-security-rules) for what to use before you go public.

5. Click **Enable**.

The app uses three collections: `users`, `shots`, and `gameSessions`. They are created automatically on first write — you don't need to pre-create them.

### 4. Configure Firestore security rules

Open **Firestore Database → Rules** in the console.

For local development and trusted classroom use you can start with the permissive rules below. They allow any client with your Firebase config to read and write the three collections this app uses:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{document=**} {
      allow read, write: if true;
    }
    match /shots/{document=**} {
      allow read, write: if true;
    }
    match /gameSessions/{document=**} {
      allow read, write: if true;
    }
  }
}
```

Click **Publish** to apply.

For a hardened deployment you should add Firebase Authentication and tighten the rules to `allow read, write: if request.auth != null;` (or stricter). The current app does not include sign-in flows out of the box, so adding auth is a small additional implementation step.

### 5. Create the `.env` file locally

Copy the example file and fill in the values you saved in step 2:

```bash
cp .env.example .env
```

Edit `.env` so it looks like this (replace the placeholders with your real values):

```env
VITE_FIREBASE_API_KEY="AIza..."
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project"
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="1234567890"
VITE_FIREBASE_APP_ID="1:1234567890:web:abc123"
VITE_FIREBASE_MEASUREMENT_ID="G-XXXXXXXX"
```

Notes:

- The `VITE_` prefix is required by Vite to expose the variable to client-side code.
- `VITE_FIREBASE_MEASUREMENT_ID` is optional — leave it blank if you didn't enable Analytics.
- `.env` is git-ignored. **Never commit it.** If you've ever accidentally committed Firebase keys, [rotate them](https://console.firebase.google.com) by deleting the web app and re-registering.

---

## Running the App Locally

```bash
npm install      # only the first time, or after pulling new dependencies
npm run dev
```

Vite will print a local URL (default: http://localhost:5173). Open it in any modern browser.

Other scripts:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server with hot reload. |
| `npm run build` | Type-check (`tsc -b`) and build a production bundle into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally so you can sanity-check the production build before deploying. |
| `npm run lint` | Run ESLint over the codebase. |

---

## Project Structure

```
.
├── src/
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Router + route definitions
│   ├── index.css               # Tailwind import
│   ├── types.ts                # Shared TypeScript types (User, Shot, GameSession)
│   ├── lib/
│   │   ├── firebase.ts         # Firebase init (reads VITE_FIREBASE_* env vars)
│   │   └── scoring.ts          # Zone point values + team rotation logic
│   ├── components/
│   │   ├── ZoneGrid.tsx        # 3x3 zone selection grid
│   │   ├── BasketballCourtHeatMap.tsx
│   │   └── InfoTooltip.tsx
│   └── pages/
│       ├── Home.tsx            # Mode picker (Individual / Team)
│       ├── Setup.tsx           # Player ID entry + team assignment
│       ├── Play.tsx            # Live shot recording
│       ├── Stats.tsx           # Post-game stats for one game
│       ├── Dashboard.tsx       # Aggregated dashboard across games
│       ├── Leaderboard.tsx     # Individual leaderboard
│       └── Seed.tsx            # Generate demo data
├── context.md                  # Full domain spec (game rules, schema, UX)
├── vite.config.ts              # Vite + React + Tailwind plugin config
├── eslint.config.js
├── tsconfig*.json
└── package.json
```

## Routes / Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `pages/Home.tsx` | Pick Individual or Team play. |
| `/setup` | `pages/Setup.tsx` | Enter player IDs; for team play, split into two teams. |
| `/play/:gameId` | `pages/Play.tsx` | Shot-recording UI with the 3x3 zone grid and Make/Miss buttons. |
| `/stats/:gameId` | `pages/Stats.tsx` | Post-game stats: heatmap, per-zone bars, accuracies, winner. |
| `/dashboard` | `pages/Dashboard.tsx` | Cross-game aggregated dashboard. |
| `/leaderboard` | `pages/Leaderboard.tsx` | Individual leaderboard. |
| `/seed` | `pages/Seed.tsx` | Generate randomized demo players + game history (handy for trying out the dashboard). |

## Firestore Schema

### `users`
| Field | Type | Notes |
|-------|------|-------|
| `playerId` | string | Physical name-tag ID. |
| `createdAt` | Timestamp | |

### `shots`
| Field | Type | Notes |
|-------|------|-------|
| `gameId` | string | Reference to `gameSessions`. |
| `playerId` | string | Reference to `users`. |
| `activityType` | `"individual" \| "team"` | |
| `shotFrom` | number (1–6) | Zone the shot was taken from. |
| `result` | `"make" \| "miss"` | |
| `pointsEarned` | number (0/1/2/3) | Derived from zone + result. |
| `shotNumber` | number | Sequence within the game. |
| `timestamp` | Timestamp | |

### `gameSessions`
| Field | Type | Notes |
|-------|------|-------|
| `activityType` | `"individual" \| "team"` | |
| `playerIds` | string[] | All participating player IDs. |
| `teams` | `{ team1: string[], team2: string[] }?` | Only present for team play. |
| `isCompleted` | boolean | Games only "register" on completion. |
| `startTime` | Timestamp | |
| `endTime` | Timestamp? | |
| `totalShots` | number | Denormalized counter. |
| `totalPoints` | number | Denormalized counter. |
| `lockedUntil` | Timestamp? | Session lock so two recorders don't double-write. |

See `context.md` and `src/types.ts` for the full spec.

---

## Building for Production

```bash
npm run build
```

This runs `tsc -b` (TypeScript project references) and then `vite build`, producing a fully static site in `dist/`. You can preview it locally with:

```bash
npm run preview
```

---

## Deploying

The output of `npm run build` is a static SPA — any static host will work. The only runtime dependency is Firestore, which the client talks to directly using the `VITE_FIREBASE_*` config baked into the bundle at build time.

> **Reminder:** the `VITE_FIREBASE_*` values end up in the public JS bundle. That's normal and expected for Firebase web apps — security comes from your **Firestore security rules**, not from hiding the API key. Make sure your rules are configured before you put the app on the public internet.

### Option A: Firebase Hosting (recommended)

This is the smoothest path because your project is already on Firebase.

1. Install the CLI if you haven't:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in:
   ```bash
   firebase login
   ```
3. Initialize hosting (run from the project root):
   ```bash
   firebase init hosting
   ```
   Answer the prompts:
   - **Use an existing project** → pick the Firebase project you created above.
   - **Public directory** → `dist`
   - **Single-page app (rewrite all URLs to /index.html)** → `Yes` (required because the app uses client-side routing via React Router)
   - **Set up automatic builds and deploys with GitHub?** → optional. Saying yes wires up a GitHub Action that re-deploys on push.
   - **Overwrite `dist/index.html`?** → `No`

4. Build and deploy:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. The CLI will print the live URL (e.g. `https://your-project.web.app`). You can also add a custom domain from **Hosting → Add custom domain** in the console.

### Option B: Vercel

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import the repo.
3. Vercel auto-detects Vite. Confirm:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Under **Environment Variables**, add every `VITE_FIREBASE_*` variable from your `.env`.
5. Click **Deploy**.

Because the app uses client-side routing, Vercel's default Vite preset already handles SPA fallback correctly.

### Option C: Netlify

1. Push the repo to GitHub.
2. On [netlify.com](https://netlify.com), click **Add new site → Import an existing project** and pick the repo.
3. Settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Add the `VITE_FIREBASE_*` variables under **Site settings → Environment variables**.
5. Add a `_redirects` file (or `netlify.toml`) so client-side routes work:
   ```
   /*  /index.html  200
   ```
6. Trigger a deploy.

### Option D: Any static host

Run `npm run build`, upload everything in `dist/` to your host, and configure it to serve `index.html` for unknown paths (SPA fallback). That's it.

---

## Environment Variables Reference

| Variable | Required | Where to find it |
|----------|----------|------------------|
| `VITE_FIREBASE_API_KEY` | Yes | Project Settings → General → Your apps → SDK setup |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Same as above |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Same as above |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Same as above |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Same as above |
| `VITE_FIREBASE_APP_ID` | Yes | Same as above |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Only present if Analytics is enabled |

---

## Troubleshooting

**"Firebase: Error (auth/invalid-api-key)" or blank page after launch.**
Your `.env` values are missing or wrong. Double-check that the file is named exactly `.env` (no `.txt`), sits at the project root, and that you restarted `npm run dev` after editing it — Vite only loads `.env` at startup.

**Writes succeed locally but fail in production with `permission-denied`.**
You're past the 30-day grace period of Firestore "test mode" rules, or you tightened the rules. Update them under Firestore → Rules (see [step 4](#4-configure-firestore-security-rules)).

**Refreshing on `/play/abc123` gives a 404 in production.**
Your host isn't doing SPA fallback. Configure it to serve `index.html` for unknown paths (Firebase Hosting does this automatically when you answer "Yes" to the SPA prompt; Netlify needs a `_redirects` file; Vercel handles it via the Vite preset).

**`tsc -b` fails the build with type errors.**
Run `npm run build` and read the first error — TypeScript stops at the first failure. Most often this is a stale type cache; try `rm -rf node_modules/.cache dist` and rebuild.

**Tailwind classes aren't applying.**
Make sure `src/index.css` contains `@import "tailwindcss";` and that `vite.config.ts` includes the `@tailwindcss/vite` plugin.

**Two recorders are stepping on each other.**
That's what the `lockedUntil` field on `gameSessions` is for. Make sure both recorders are using the same `gameId` and that one of them holds the lock — open the game from the active session list rather than starting a new one.

---

## Security Notes

- **The values in `VITE_FIREBASE_*` are public** — they ship in the client bundle. That's how Firebase web SDKs work. Your real security perimeter is **Firestore security rules**.
- For a public deployment, replace the permissive rules in [step 4](#4-configure-firestore-security-rules) with rules that require Firebase Authentication and validate field shapes.
- **Never commit `.env`.** It's in `.gitignore`. If you ever accidentally commit it, rotate the keys via the Firebase console (delete the web app, re-register, replace the values).
- The repo's `.env` was committed historically — treat any keys you find in old git history as compromised and create your own Firebase project for any real deployment.

---

## Contributing

Pull requests welcome. Before opening one:

```bash
npm run lint
npm run build
```

Both should pass. Keep PRs focused on a single concern, and add a brief description of what changed and why.

---

## License

See [LICENSE](./LICENSE).
