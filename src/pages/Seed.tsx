import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, writeBatch, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getPointsForZone } from "../lib/scoring";

const FIRST_NAMES = [
  "AIDEN", "AVA", "BEN", "CAI", "EVA", "FIN", "GIA", "IAN", "ISLA", "JAKE",
  "KAI", "LEO", "LIV", "MAX", "MIA", "NORA", "NOAH", "OMAR", "RUBY", "SAGE",
  "TARA", "ZARA", "ELI", "EMMA", "LUCA", "NICO", "RYAN", "ZOE", "JUNE", "KOBE",
  "ASH", "REMI", "SOFI", "TOMO", "WREN", "YARA", "QUIN", "PIPA", "HUGO", "GIGI",
];

// Base make rates: further zones are harder.
const ZONE_MAKE_RATE: Record<number, number> = {
  1: 0.80, // 1pt, closest
  2: 0.55, // 2pt
  3: 0.55, // 2pt
  4: 0.32, // 3pt
  5: 0.24, // 3pt, deepest
  6: 0.30, // 3pt
};

function sampleNormal(mean: number, std: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePlayerId(existing: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    const id = `${name}${suffix}`;
    if (!existing.has(id)) {
      existing.add(id);
      return id;
    }
  }
  throw new Error("Could not generate unique player ID");
}

function pickZoneNoRepeat(previous: number | null): number {
  while (true) {
    const z = Math.floor(Math.random() * 6) + 1;
    if (z !== previous) return z;
  }
}

function pickZone(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// Sample without replacement from an array.
function sampleN<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0 && i >= copy.length - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(copy.length - n);
}

// Distribute `total` shots among `count` players, each in [minPer, maxPer].
function distributeShots(count: number, total: number, minPer: number, maxPer: number): number[] {
  if (count * minPer > total || count * maxPer < total) {
    throw new Error(`distributeShots: impossible (count=${count}, total=${total})`);
  }
  const counts = Array(count).fill(minPer);
  let remaining = total - count * minPer;
  let safety = remaining * 20 + 1;
  while (remaining > 0 && safety-- > 0) {
    const idx = Math.floor(Math.random() * count);
    if (counts[idx] < maxPer) {
      counts[idx]++;
      remaining--;
    }
  }
  if (remaining > 0) throw new Error("distributeShots: could not allocate remaining shots");
  return counts;
}

interface ShotData {
  playerId: string;
  zone: number;
  make: boolean;
  points: number;
}

interface IndividualGame {
  playerId: string;
  shots: ShotData[];
  totalPoints: number;
  startTime: Date;
}

interface TeamGame {
  team1: string[];
  team2: string[];
  shots: ShotData[]; // ordered
  totalPoints: number;
  startTime: Date;
}

interface PlayerProfile {
  playerId: string;
  skill: number;
  individualGame: IndividualGame;
}

function generateIndividualGame(playerId: string, skill: number): IndividualGame {
  const dayFactor = clamp(sampleNormal(1.0, 0.08), 0.75, 1.25);
  const effectiveSkill = clamp(skill * dayFactor, 0.3, 1.7);

  const shots: ShotData[] = [];
  let previousZone: number | null = null;
  let totalPoints = 0;
  for (let i = 0; i < 20; i++) {
    const zone = pickZoneNoRepeat(previousZone);
    const rate = clamp(ZONE_MAKE_RATE[zone] * effectiveSkill, 0.03, 0.97);
    const make = Math.random() < rate;
    const points = make ? getPointsForZone(zone) : 0;
    totalPoints += points;
    shots.push({ playerId, zone, make, points });
    previousZone = zone;
  }
  // Individual games span days 15-30 ago — they happen first so players
  // exist before being drawn into team games.
  const daysAgo = 15 + Math.random() * 15;
  const startTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { playerId, shots, totalPoints, startTime };
}

function generateTeamGame(profiles: PlayerProfile[]): TeamGame {
  const totalPlayers = randInt(4, Math.min(12, profiles.length));
  // Balanced split: difference between teams at most 1.
  const baseSize = Math.floor(totalPlayers / 2);
  const coin = totalPlayers % 2 === 0 ? 0 : Math.round(Math.random());
  const team1Size = baseSize + coin;
  const team2Size = totalPlayers - team1Size;

  const roster = sampleN(profiles, totalPlayers);
  const team1Profiles = roster.slice(0, team1Size);
  const team2Profiles = roster.slice(team1Size);

  const team1Ids = team1Profiles.map((p) => p.playerId);
  const team2Ids = team2Profiles.map((p) => p.playerId);

  // 30 shots per team, each player 5-15.
  const team1Counts = distributeShots(team1Size, 30, 5, 15);
  const team2Counts = distributeShots(team2Size, 30, 5, 15);

  // Build the queue of shooters for each team in round-robin order.
  const team1Queue: PlayerProfile[] = [];
  const team2Queue: PlayerProfile[] = [];
  const team1Remaining = team1Counts.slice();
  const team2Remaining = team2Counts.slice();
  while (team1Queue.length < 30) {
    for (let i = 0; i < team1Size && team1Queue.length < 30; i++) {
      if (team1Remaining[i] > 0) {
        team1Queue.push(team1Profiles[i]);
        team1Remaining[i]--;
      }
    }
  }
  while (team2Queue.length < 30) {
    for (let i = 0; i < team2Size && team2Queue.length < 30; i++) {
      if (team2Remaining[i] > 0) {
        team2Queue.push(team2Profiles[i]);
        team2Remaining[i]--;
      }
    }
  }

  // Per-game team factor — simulates a hot/cold game for each side.
  const team1Factor = clamp(sampleNormal(1.0, 0.1), 0.75, 1.25);
  const team2Factor = clamp(sampleNormal(1.0, 0.1), 0.75, 1.25);

  // Interleave teams: t1, t2, t1, t2 ... (matches the app's alternating turn rule).
  const shots: ShotData[] = [];
  let totalPoints = 0;
  for (let i = 0; i < 30; i++) {
    for (const pair of [
      { p: team1Queue[i], factor: team1Factor },
      { p: team2Queue[i], factor: team2Factor },
    ]) {
      const zone = pickZone();
      const effectiveSkill = clamp(pair.p.skill * pair.factor, 0.3, 1.7);
      const rate = clamp(ZONE_MAKE_RATE[zone] * effectiveSkill, 0.03, 0.97);
      const make = Math.random() < rate;
      const points = make ? getPointsForZone(zone) : 0;
      totalPoints += points;
      shots.push({ playerId: pair.p.playerId, zone, make, points });
    }
  }

  // Team games span days 0-14 ago (after all individual games).
  const daysAgo = Math.random() * 14;
  const startTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { team1: team1Ids, team2: team2Ids, shots, totalPoints, startTime };
}

export default function Seed() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ stage: "", done: 0, total: 0 });
  const [message, setMessage] = useState("");

  async function runSeed() {
    const playerCount = randInt(75, 125);
    const teamGameCount = randInt(Math.floor(playerCount * 0.4), Math.floor(playerCount * 1.0));
    if (!confirm(
      `Generate ${playerCount} fake players (each with 1 individual game) and ${teamGameCount} team games with randomized rosters? This writes to Firestore.`
    )) return;

    setStatus("running");
    setMessage("");

    try {
      const existingSnap = await getDocs(collection(db, "users"));
      const existing = new Set<string>(existingSnap.docs.map((d) => d.id));

      const profiles: PlayerProfile[] = [];
      for (let i = 0; i < playerCount; i++) {
        const id = generatePlayerId(existing);
        const skill = clamp(sampleNormal(1.0, 0.22), 0.35, 1.6);
        profiles.push({
          playerId: id,
          skill,
          individualGame: generateIndividualGame(id, skill),
        });
      }

      const teamGames: TeamGame[] = [];
      for (let i = 0; i < teamGameCount; i++) {
        teamGames.push(generateTeamGame(profiles));
      }

      // Firestore batch cap is 500 ops. Accumulate and flush before hitting it.
      const OP_CAP = 450;
      let batch = writeBatch(db);
      let opsInBatch = 0;
      const flush = async () => {
        if (opsInBatch > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      };
      const ensureCapacity = async (needed: number) => {
        if (opsInBatch + needed > OP_CAP) await flush();
      };

      // Phase 1: users + individual games.
      setProgress({ stage: "Individual games", done: 0, total: playerCount });
      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        const g = p.individualGame;
        const startTs = Timestamp.fromDate(g.startTime);
        const endTs = Timestamp.fromMillis(g.startTime.getTime() + 5 * 60 * 1000);

        // 1 user + 1 session + 20 shots = 22 ops.
        await ensureCapacity(22);
        batch.set(
          doc(db, "users", p.playerId),
          { playerId: p.playerId, createdAt: startTs },
          { merge: true }
        );
        opsInBatch++;

        const sessionRef = doc(collection(db, "gameSessions"));
        batch.set(sessionRef, {
          activityType: "individual",
          playerIds: [p.playerId],
          isCompleted: true,
          startTime: startTs,
          endTime: endTs,
          totalShots: 20,
          totalPoints: g.totalPoints,
        });
        opsInBatch++;

        g.shots.forEach((s, idx) => {
          const shotRef = doc(collection(db, "shots"));
          batch.set(shotRef, {
            gameId: sessionRef.id,
            playerId: s.playerId,
            activityType: "individual",
            shotFrom: s.zone,
            result: s.make ? "make" : "miss",
            pointsEarned: s.points,
            shotNumber: idx + 1,
            timestamp: Timestamp.fromMillis(g.startTime.getTime() + idx * 12 * 1000),
          });
          opsInBatch++;
        });
        setProgress({ stage: "Individual games", done: i + 1, total: playerCount });
      }

      // Phase 2: team games.
      setProgress({ stage: "Team games", done: 0, total: teamGameCount });
      for (let i = 0; i < teamGames.length; i++) {
        const g = teamGames[i];
        const startTs = Timestamp.fromDate(g.startTime);
        // Team games take longer — ~20 seconds per shot.
        const endTs = Timestamp.fromMillis(g.startTime.getTime() + g.shots.length * 20 * 1000);

        // 1 session + 60 shots = 61 ops.
        await ensureCapacity(61);
        const sessionRef = doc(collection(db, "gameSessions"));
        batch.set(sessionRef, {
          activityType: "team",
          playerIds: [...g.team1, ...g.team2],
          teams: { team1: g.team1, team2: g.team2 },
          isCompleted: true,
          startTime: startTs,
          endTime: endTs,
          totalShots: g.shots.length,
          totalPoints: g.totalPoints,
        });
        opsInBatch++;

        g.shots.forEach((s, idx) => {
          const shotRef = doc(collection(db, "shots"));
          batch.set(shotRef, {
            gameId: sessionRef.id,
            playerId: s.playerId,
            activityType: "team",
            shotFrom: s.zone,
            result: s.make ? "make" : "miss",
            pointsEarned: s.points,
            shotNumber: idx + 1,
            timestamp: Timestamp.fromMillis(g.startTime.getTime() + idx * 20 * 1000),
          });
          opsInBatch++;
        });
        setProgress({ stage: "Team games", done: i + 1, total: teamGameCount });
      }

      await flush();

      const individualShots = playerCount * 20;
      const teamShots = teamGames.reduce((sum, g) => sum + g.shots.length, 0);
      setStatus("done");
      setMessage(
        `Seeded ${playerCount} players, ${playerCount} individual games, ${teamGameCount} team games, ${individualShots + teamShots} total shots.`
      );
    } catch (e) {
      console.error(e);
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <Link to="/" className="text-gray-400 hover:text-white mb-6 block">&larr; Back</Link>
      <h1 className="text-3xl font-bold mb-4">Seed Demo Data</h1>
      <div className="text-gray-400 mb-6 max-w-xl space-y-2">
        <p>Generates 75–125 fake players, each with exactly one completed individual game (20 shots).</p>
        <p>Then generates a randomized number of team games (roughly 40–100% of the player count). Each team game has 4–12 random players split into balanced teams, with 30 shots per team and every player taking 5–15 shots.</p>
        <p>Make rates are realistic — closer zones land more often. Each player has a stable skill level, plus per-game noise for good/bad days.</p>
        <p className="text-yellow-400 text-sm">Running this multiple times will create additional players and games each time.</p>
      </div>
      <button
        onClick={runSeed}
        disabled={status === "running"}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-6 py-3 rounded-xl font-semibold transition-colors"
      >
        {status === "running"
          ? `${progress.stage}… ${progress.done}/${progress.total}`
          : "Run Seed"}
      </button>
      {status === "done" && <p className="text-green-400 mt-4">{message}</p>}
      {status === "error" && <p className="text-red-400 mt-4">Error: {message}</p>}
    </div>
  );
}
