import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ZONE_POINTS } from "../lib/scoring";
import type { GameSession, Shot } from "../types";
import BasketballCourtHeatMap from "../components/BasketballCourtHeatMap";
import type { HeatmapShot } from "../components/BasketballCourtHeatMap";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

export default function Stats() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<GameSession | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!gameId) return;
      try {
        const sessionDoc = await getDoc(doc(db, "gameSessions", gameId));
        if (!sessionDoc.exists()) {
          setError("Game not found.");
          setLoading(false);
          return;
        }
        const sess = { id: sessionDoc.id, ...sessionDoc.data() } as GameSession;

        // Mark game as completed
        if (!sess.isCompleted) {
          await updateDoc(doc(db, "gameSessions", gameId), {
            isCompleted: true,
            endTime: Timestamp.now(),
          });
        }

        const shotsQuery = query(
          collection(db, "shots"),
          where("gameId", "==", gameId)
        );
        const shotsSnap = await getDocs(shotsQuery);
        const shotsList = shotsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Shot)
          .sort((a, b) => a.shotNumber - b.shotNumber);

        setSession(sess);
        setShots(shotsList);
      } catch (e) {
        setError("Failed to load stats.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gameId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xl">Loading stats...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-xl">{error || "Game not found."}</p>
        <button
          onClick={() => (error ? window.location.reload() : navigate("/"))}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold"
        >
          {error ? "Retry" : "Home"}
        </button>
      </div>
    );
  }

  const isTeam = session.activityType === "team";

  // Zone data for heatmap
  const zoneData: Record<number, { makes: number; misses: number }> = {};
  for (let z = 1; z <= 6; z++) zoneData[z] = { makes: 0, misses: 0 };
  for (const s of shots) {
    if (s.result === "make") zoneData[s.shotFrom].makes++;
    else zoneData[s.shotFrom].misses++;
  }

  // Total stats
  const totalShots = shots.length;
  const totalMakes = shots.filter((s) => s.result === "make").length;
  const totalPoints = shots.reduce((sum, s) => sum + s.pointsEarned, 0);
  const accuracy = totalShots > 0 ? Math.round((totalMakes / totalShots) * 100) : 0;

  // Per-player stats
  const playerStats: Record<
    string,
    { shots: number; makes: number; points: number }
  > = {};
  for (const id of session.playerIds) {
    playerStats[id] = { shots: 0, makes: 0, points: 0 };
  }
  for (const s of shots) {
    const ps = playerStats[s.playerId];
    if (ps) {
      ps.shots++;
      if (s.result === "make") ps.makes++;
      ps.points += s.pointsEarned;
    }
  }

  // Points per zone
  const zonePoints: Record<number, number> = {};
  for (let z = 1; z <= 6; z++) {
    zonePoints[z] = zoneData[z].makes * ZONE_POINTS[z];
  }

  // Team stats
  let team1Points = 0;
  let team2Points = 0;
  let winner = "";
  if (isTeam && session.teams) {
    for (const s of shots) {
      if (session.teams.team1.includes(s.playerId)) team1Points += s.pointsEarned;
      else team2Points += s.pointsEarned;
    }
    if (team1Points > team2Points) winner = "Team 1 Wins!";
    else if (team2Points > team1Points) winner = "Team 2 Wins!";
    else winner = "It's a Tie!";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-12">
      <h1 className="text-3xl font-bold text-center mb-6">Game Stats</h1>

      {/* Winner banner for team mode */}
      {isTeam && (
        <div className="text-center mb-6">
          <p className="text-4xl font-bold text-yellow-400">{winner}</p>
          <p className="text-lg text-gray-400 mt-2">
            <span className="text-blue-400">Team 1: {team1Points} pts</span>
            {" vs "}
            <span className="text-orange-400">Team 2: {team2Points} pts</span>
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="flex gap-3 justify-center mb-8 flex-wrap">
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center border border-amber-500/20">
          <p className="text-3xl font-bold text-amber-400">{totalPoints}</p>
          <p className="text-sm text-gray-400">Total Points</p>
        </div>
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center border border-cyan-500/20">
          <p className="text-3xl font-bold text-cyan-400">{accuracy}%</p>
          <p className="text-sm text-gray-400">Accuracy</p>
        </div>
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center border border-violet-500/20">
          <p className="text-3xl font-bold text-violet-400">
            {totalMakes}/{totalShots}
          </p>
          <p className="text-sm text-gray-400">Makes/Shots</p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="max-w-2xl mx-auto mb-8">
        <BasketballCourtHeatMap
          shots={shots.map((s): HeatmapShot => ({ location: String(s.shotFrom), made: s.result === 'make' }))}
          title="Shot Heatmap"
          compact={false}
          showZoneStats
          showQuickInsight
        />
      </div>

      {/* Zone Performance Radar */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center text-amber-400">
          Zone Performance
        </h2>
        <div className="bg-gray-800/50 rounded-xl p-2">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => {
                const total = zoneData[z].makes + zoneData[z].misses;
                return {
                  zone: `Zone ${z} (${ZONE_POINTS[z]}pt)`,
                  accuracy: total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0,
                  points: zonePoints[z],
                };
              })}
            >
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Radar name="Accuracy %" dataKey="accuracy" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
              <Radar name="Points" dataKey="points" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Points by Zone Bar Chart */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center text-amber-400">
          Points by Zone
        </h2>
        <div className="bg-gray-800/50 rounded-xl p-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[1, 2, 3, 4, 5, 6].map((z) => ({
                zone: `Z${z}`,
                points: zonePoints[z],
                makes: zoneData[z].makes,
                misses: zoneData[z].misses,
              }))}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
              />
              <Bar dataKey="points" name="Points" radius={[4, 4, 0, 0]}>
                {[1, 2, 3, 4, 5, 6].map((z) => (
                  <Cell key={z} fill={ZONE_POINTS[z] === 3 ? "#f59e0b" : ZONE_POINTS[z] === 2 ? "#3b82f6" : "#8b5cf6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-1 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500" />1pt</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />2pt</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />3pt</span>
          </div>
        </div>
      </div>

      {/* Per-player stats */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center text-violet-400">
          Player Stats
        </h2>
        <div className="bg-gray-800/50 rounded-xl p-2">
          <ResponsiveContainer width="100%" height={Math.max(180, session.playerIds.length * 50 + 40)}>
            <BarChart
              layout="vertical"
              data={session.playerIds.map((id) => {
                const ps = playerStats[id];
                const pAcc = ps.shots > 0 ? Math.round((ps.makes / ps.shots) * 100) : 0;
                return { name: id, accuracy: pAcc, points: ps.points, makes: ps.makes, shots: ps.shots };
              })}
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#d1d5db", fontSize: 12 }} width={70} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
                itemStyle={{ color: "#d1d5db" }}
                formatter={(value, name) => {
                  if (name === "Accuracy" && typeof value === "number") {
                    return [`${value}%`, name];
                  }
                  return [value ?? "-", name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              <Bar dataKey="points" name="Points" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={16} />
              <Bar dataKey="accuracy" name="Accuracy" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* New Game button */}
      <div className="text-center">
        <button
          onClick={() => navigate("/")}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xl font-semibold py-4 px-12 rounded-xl transition-colors"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
