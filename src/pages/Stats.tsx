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
import BasketballCourtHeatMap, { zoneDataToShots } from "../components/BasketballCourtHeatMap";
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

  const radarData = [1, 2, 3, 4, 5, 6].map((z) => {
    const total = zoneData[z].makes + zoneData[z].misses;
    return {
      zone: `Z${z} (${ZONE_POINTS[z]}pt)`,
      accuracy: total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0,
      points: zonePoints[z],
    };
  });

  const barData = [1, 2, 3, 4, 5, 6].map((z) => ({
    zone: `Z${z}`,
    points: zonePoints[z],
    makes: zoneData[z].makes,
    misses: zoneData[z].misses,
  }));

  const playerData = session.playerIds.map((id) => {
    const ps = playerStats[id];
    const pAcc = ps.shots > 0 ? Math.round((ps.makes / ps.shots) * 100) : 0;
    const team = isTeam && session.teams
      ? session.teams.team1.includes(id) ? 1 : 2
      : 0;
    return { name: id, accuracy: pAcc, points: ps.points, makes: ps.makes, shots: ps.shots, team };
  });

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 },
    labelStyle: { color: "#f3f4f6" },
    itemStyle: { color: "#d1d5db" },
  };

  return (
    <div className="lg:h-screen bg-gray-950 text-white p-3 lg:overflow-hidden min-h-screen overflow-y-auto">
      <div className="flex flex-col lg:h-full">
        {/* Header row: title + summary cards + back to home */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Game Stats</h1>
            {isTeam && (
              <span className="text-lg font-bold text-yellow-400">{winner}
                <span className="text-sm text-gray-400 ml-2">
                  <span className="text-blue-400">{team1Points}</span> – <span className="text-orange-400">{team2Points}</span>
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center border border-amber-500/20">
                <span className="text-lg font-bold text-amber-400">{totalPoints}</span>
                <span className="text-xs text-gray-400 ml-1">pts</span>
              </div>
              <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center border border-cyan-500/20">
                <span className="text-lg font-bold text-cyan-400">{accuracy}%</span>
                <span className="text-xs text-gray-400 ml-1">acc</span>
              </div>
              <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center border border-violet-500/20">
                <span className="text-lg font-bold text-violet-400">{totalMakes}/{totalShots}</span>
              </div>
            </div>
            <button
              onClick={() => navigate("/")}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 px-5 rounded-lg transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>

        {/* Team Rosters */}
        {isTeam && session.teams && (
          <div className="flex gap-3 mb-2">
            <div className="flex-1 bg-gray-900/75 border border-blue-500/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-blue-400 shrink-0">Team 1 ({team1Points}pts):</span>
                <div className="flex gap-1.5 flex-wrap">
                  {session.teams.team1.map((id) => (
                    <span key={id} className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-md border border-blue-500/30">{id}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 bg-gray-900/75 border border-orange-500/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-orange-400 shrink-0">Team 2 ({team2Points}pts):</span>
                <div className="flex gap-1.5 flex-wrap">
                  {session.teams.team2.map((id) => (
                    <span key={id} className="bg-orange-500/20 text-orange-300 text-xs px-2 py-0.5 rounded-md border border-orange-500/30">{id}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main content grid */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-12 gap-3 max-lg:grid-cols-1">
          {/* Left: Heatmap */}
          <div className="lg:col-span-4 bg-gray-900/75 border border-gray-800 rounded-xl p-3 flex flex-col">
            <h2 className="text-sm font-semibold mb-2 text-center text-white">Shot Heatmap</h2>
            <div className="flex-1 min-h-0 flex items-center justify-center w-full">
              <div className="w-full">
                <BasketballCourtHeatMap
                  shots={zoneDataToShots(zoneData)}
                  title=""
                  compact
                  showLegend={false}
                  showZoneStats={false}
                  showQuickInsight={false}
                  courtMaxWidthClass="max-w-full"
                />
              </div>
            </div>
            {/* Zone stats table */}
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
              {[1, 2, 3, 4, 5, 6].map((z) => {
                const total = zoneData[z].makes + zoneData[z].misses;
                const acc = total > 0 ? Math.round((zoneData[z].makes / total) * 100) : 0;
                return (
                  <div key={z} className="bg-gray-800/60 rounded px-1.5 py-1 flex items-center justify-between">
                    <span className="text-gray-400">Z{z}<span className="text-gray-600 ml-0.5">({ZONE_POINTS[z]}pt)</span></span>
                    <span className="font-medium">
                      <span className="text-green-400">{zoneData[z].makes}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-gray-300">{total}</span>
                      <span className={`ml-1 ${acc >= 50 ? "text-green-400" : total > 0 ? "text-red-400" : "text-gray-600"}`}>{acc}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-2 mt-1.5 text-[10px] text-gray-400">
              <span>0%</span>
              <div
                className="h-2 w-24 rounded"
                style={{ background: "linear-gradient(to right, hsl(0,80%,40%), hsl(40,90%,50%), hsl(140,70%,40%))" }}
              />
              <span>100%</span>
              <span className="flex items-center gap-1 ml-1">
                <span className="w-2 h-2 bg-gray-800 rounded border border-gray-700" /> No attempts
              </span>
            </div>
          </div>

          {/* Center: Zone Performance Radar */}
          <div className="lg:col-span-4 bg-gray-900/75 border border-gray-800 rounded-xl p-3 flex flex-col">
            <h2 className="text-sm font-semibold mb-2 text-center text-white">Zone Performance</h2>
            <div className="flex-1" style={{ minHeight: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 9 }} />
                  <Radar name="Accuracy %" dataKey="accuracy" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                  <Radar name="Points" dataKey="points" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#9ca3af" }} />
                  <Tooltip {...tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right: Points by Zone + Player Stats stacked */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            {/* Points by Zone */}
            <div className="flex-1 min-h-0 bg-gray-900/75 border border-gray-800 rounded-xl p-3 flex flex-col">
              <h2 className="text-sm font-semibold mb-1 text-center text-white">Points by Zone</h2>
              <div className="flex-1" style={{ minHeight: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="zone" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="points" name="Points" radius={[4, 4, 0, 0]}>
                      {[1, 2, 3, 4, 5, 6].map((z) => (
                        <Cell key={z} fill={ZONE_POINTS[z] === 3 ? "#f59e0b" : ZONE_POINTS[z] === 2 ? "#3b82f6" : "#8b5cf6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-3 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500" />1pt</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />2pt</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />3pt</span>
              </div>
            </div>

            {/* Player Stats */}
            <div className="flex-1 min-h-0 bg-gray-900/75 border border-gray-800 rounded-xl p-3 flex flex-col overflow-y-auto">
              <h2 className="text-sm font-semibold mb-1 text-center text-white shrink-0">Player Stats</h2>
              <div className="flex-1" style={{ minHeight: Math.max(180, playerData.length * 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={playerData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#d1d5db", fontSize: 10 }} width={55} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value, name) => {
                        if (name === "Accuracy" && typeof value === "number") return [`${value}%`, name];
                        return [value ?? "-", name];
                      }}
                    />
                    <Bar dataKey="points" name="Points" radius={[0, 4, 4, 0]} barSize={14}>
                      {playerData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.team === 1 ? "#3b82f6" : entry.team === 2 ? "#f97316" : "#f59e0b"} />
                      ))}
                    </Bar>
                    <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]} barSize={14}>
                      {playerData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.team === 1 ? "#60a5fa" : entry.team === 2 ? "#fb923c" : "#06b6d4"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-3 mt-1 text-[10px] text-gray-400 shrink-0">
                {isTeam ? (
                  <>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />Team 1</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500" />Team 2</span>
                    <span className="text-gray-600">|</span>
                  </>
                ) : null}
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: isTeam ? "linear-gradient(to right, #3b82f6 50%, #f97316 50%)" : "#f59e0b" }} />Points</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: isTeam ? "linear-gradient(to right, #60a5fa 50%, #fb923c 50%)" : "#06b6d4" }} />Accuracy</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
