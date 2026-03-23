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
import ZoneGrid from "../components/ZoneGrid";

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
  const maxZonePoints = Math.max(...Object.values(zonePoints), 1);

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
            <span className="text-green-400">Team 2: {team2Points} pts</span>
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="flex gap-3 justify-center mb-8 flex-wrap">
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{totalPoints}</p>
          <p className="text-sm text-gray-400">Total Points</p>
        </div>
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center">
          <p className="text-3xl font-bold text-green-400">{accuracy}%</p>
          <p className="text-sm text-gray-400">Accuracy</p>
        </div>
        <div className="bg-gray-800 rounded-xl px-6 py-4 text-center">
          <p className="text-3xl font-bold text-purple-400">
            {totalMakes}/{totalShots}
          </p>
          <p className="text-sm text-gray-400">Makes/Shots</p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center">Shot Heatmap</h2>
        <ZoneGrid mode="heatmap" zoneData={zoneData} />
        <div className="flex justify-center gap-4 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-600 rounded" /> &ge;66%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-orange-500 rounded" /> 33-66%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-600 rounded" /> &lt;33%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-gray-800 rounded border border-gray-700" /> No shots
          </span>
        </div>
      </div>

      {/* Points per zone bar chart */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center">
          Points by Zone
        </h2>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((z) => (
            <div key={z} className="flex items-center gap-3">
              <span className="w-16 text-sm text-gray-400">Zone {z}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all"
                  style={{
                    width: `${(zonePoints[z] / maxZonePoints) * 100}%`,
                    minWidth: zonePoints[z] > 0 ? "2rem" : 0,
                  }}
                >
                  {zonePoints[z] > 0 ? zonePoints[z] : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-player accuracy */}
      <div className="max-w-md mx-auto mb-8">
        <h2 className="text-xl font-semibold mb-3 text-center">
          Player Stats
        </h2>
        <div className="space-y-2">
          {session.playerIds.map((id) => {
            const ps = playerStats[id];
            const pAcc =
              ps.shots > 0 ? Math.round((ps.makes / ps.shots) * 100) : 0;
            const teamColor =
              isTeam && session.teams
                ? session.teams.team1.includes(id)
                  ? "bg-blue-500"
                  : "bg-green-500"
                : "bg-purple-500";
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-300 truncate">{id}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                  <div
                    className={`${teamColor} h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold transition-all`}
                    style={{
                      width: `${pAcc}%`,
                      minWidth: ps.shots > 0 ? "3rem" : 0,
                    }}
                  >
                    {pAcc}% ({ps.points}pts)
                  </div>
                </div>
              </div>
            );
          })}
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
