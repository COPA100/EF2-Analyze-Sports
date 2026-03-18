# Project Context: C4K Tabletop Basketball Analysis Tool

## 1. Technical Stack
- **Framework:** React (Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Firebase Firestore
- **State Management:** React Hooks (Effective use of `useEffect` for Firestore listeners)

## 2. Domain Logic & Rules
### Game Setup
- **App Purpose:** Data collection and post-game analysis for student learning.
- **Hardware:** Physical tabletop basketball game with 6 shooting zones.
- **Scoring System:**
  - Zone 1: 1 Point
  - Zones 2 & 3: 2 Points
  - Zones 4, 5, & 6: 3 Points

### Activity #1: Individual Play
- **Constraints:** 20 total shots per player.
- **Rule:** A player cannot shoot from the same zone twice in a row (UI must enforce this).
- **Participants:** 1 Shooter, 1 Recorder.

### Activity #2: Team Play
- **Constraints:** 30 total shots per team.
- **Rule:** No player > 15 shots; No player < 5 shots.

## 3. Database Schema (Firestore)

### Collection: `users`
- `id`: string (Doc ID)
- `name`: string
- `playerId`: string (Physical ID from name tag)
- `currentTableId`: string (Station assignment)
- `createdAt`: timestamp

### Collection: `shots`
- `id`: string (Doc ID)
- `gameId`: string (Ref to `gameSessions`)
- `playerId`: string (Ref to `users`)
- `activityType`: "individual" | "team"
- `shotFrom`: number (1–6)
- `result`: "make" | "miss"
- `pointsEarned`: number (0, 1, 2, or 3)
- `shotNumber`: number (Sequence: 1-20 or 1-30)
- `timestamp`: timestamp

### Collection: `gameSessions`
- `id`: string (Doc ID)
- `activityType`: "individual" | "team"
- `tableId`: string
- `playerIds`: string[] (Array of participant IDs)
- `isCompleted`: boolean
- `startTime`: timestamp
- `endTime`: timestamp
- `totalPoints`: number (Denormalized for performance)
- `totalShots`: number (Counter for progress bars)
- `statsSummary`: map (Pre-calculated for the Heatmap/Dashboard)
  - `zonePerformance`: { "1": { makes: 0, attempts: 0 }, ... }
  - `playerPerformance`: { "playerId": { points: 0, accuracy: 0 } }

## 4. UI/UX Functional Requirements
### Recording Interface
- **User login:** There should be a very quick and easy login process where the user can add their ID.
- **Turn Management:** Explicitly show whose turn it is by Name/ID.
- **Input:** Large 1-6 grid for Zone selection + Toggle for Make/Miss.
- **Validation:** Disable the button of the previously selected zone.
- **Sync:** Real-time push to `shots` and update `gameSessions` summary.

### Analysis Dashboard (End Screen)
- **Heatmap Component:** - Render a 3x2 or custom grid layout representing the 6 zones.
  - Use a placeholder/blank image background for the court.
  - Overlay Success Rate (%) and Points per Zone.
- **Visuals:** - Bar graphs comparing points per zone (Risk vs. Reward).
  - Individual Leaderboard for Activity #1.
  - Expected vs. Actual outcome analysis.