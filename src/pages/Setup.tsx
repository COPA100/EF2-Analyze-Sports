import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, setDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GameSession } from "../types";

export default function Setup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") as "individual" | "team";

  // Individual state
  const [playerId, setPlayerId] = useState("");

  // Team state
  const [team1Players, setTeam1Players] = useState<string[]>([]);
  const [team2Players, setTeam2Players] = useState<string[]>([]);
  const [team1Input, setTeam1Input] = useState("");
  const [team2Input, setTeam2Input] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ensureUser(id: string) {
    await setDoc(doc(db, "users", id), {
      playerId: id,
      createdAt: Timestamp.now(),
    }, { merge: true });
  }

  async function startIndividualGame() {
    const id = playerId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      await ensureUser(id);
      const session: Omit<GameSession, "id"> = {
        activityType: "individual",
        playerIds: [id],
        isCompleted: false,
        startTime: Timestamp.now(),
        totalShots: 0,
        totalPoints: 0,
      };
      const docRef = await addDoc(collection(db, "gameSessions"), session);
      navigate(`/play/${docRef.id}`, {
        state: { gameSession: { ...session, id: docRef.id } },
      });
    } catch (e) {
      setError("Failed to create game. Check your connection and try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function startTeamGame() {
    if (team1Players.length < 2 || team2Players.length < 2) {
      setError("Each team needs at least 2 players.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const allPlayers = [...team1Players, ...team2Players];
      for (const id of allPlayers) await ensureUser(id);
      const session: Omit<GameSession, "id"> = {
        activityType: "team",
        playerIds: allPlayers,
        teams: { team1: team1Players, team2: team2Players },
        isCompleted: false,
        startTime: Timestamp.now(),
        totalShots: 0,
        totalPoints: 0,
      };
      const docRef = await addDoc(collection(db, "gameSessions"), session);
      navigate(`/play/${docRef.id}`, {
        state: { gameSession: { ...session, id: docRef.id } },
      });
    } catch (e) {
      setError("Failed to create game. Check your connection and try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function addTeamPlayer(team: 1 | 2) {
    const input = team === 1 ? team1Input.trim() : team2Input.trim();
    if (!input) return;
    const players = team === 1 ? team1Players : team2Players;
    const otherPlayers = team === 1 ? team2Players : team1Players;
    if (players.includes(input) || otherPlayers.includes(input)) {
      setError("Player already added.");
      return;
    }
    setError("");
    if (team === 1) {
      setTeam1Players([...team1Players, input]);
      setTeam1Input("");
    } else {
      setTeam2Players([...team2Players, input]);
      setTeam2Input("");
    }
  }

  function removePlayer(team: 1 | 2, id: string) {
    if (team === 1) setTeam1Players(team1Players.filter((p) => p !== id));
    else setTeam2Players(team2Players.filter((p) => p !== id));
  }

  if (mode === "team") {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white mb-6 block">
          &larr; Back
        </button>
        <h1 className="text-3xl font-bold text-center mb-8">Team Setup</h1>
        {error && <p className="text-red-400 text-center mb-4">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
          {/* Team 1 */}
          <div className="flex-1 bg-blue-950/50 rounded-xl p-4 border border-blue-800">
            <h2 className="text-xl font-semibold text-blue-400 mb-3">Team 1</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={team1Input}
                onChange={(e) => setTeam1Input(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeamPlayer(1)}
                placeholder="Player ID"
                className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => addTeamPlayer(1)}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg font-semibold transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {team1Players.map((p) => (
                <span key={p} className="bg-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  {p}
                  <button onClick={() => removePlayer(1, p)} className="text-blue-300 hover:text-white ml-1 min-w-[24px] min-h-[24px] flex items-center justify-center">&times;</button>
                </span>
              ))}
            </div>
          </div>

          {/* Team 2 */}
          <div className="flex-1 bg-green-950/50 rounded-xl p-4 border border-green-800">
            <h2 className="text-xl font-semibold text-green-400 mb-3">Team 2</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={team2Input}
                onChange={(e) => setTeam2Input(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeamPlayer(2)}
                placeholder="Player ID"
                className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-green-500"
              />
              <button
                onClick={() => addTeamPlayer(2)}
                className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg font-semibold transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {team2Players.map((p) => (
                <span key={p} className="bg-green-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  {p}
                  <button onClick={() => removePlayer(2, p)} className="text-green-300 hover:text-white ml-1 min-w-[24px] min-h-[24px] flex items-center justify-center">&times;</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <button
            onClick={startTeamGame}
            disabled={loading || team1Players.length < 2 || team2Players.length < 2}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xl font-semibold py-4 px-12 rounded-xl transition-colors"
          >
            {loading ? "Creating..." : "Start Game"}
          </button>
          {(team1Players.length < 2 || team2Players.length < 2) && (
            <p className="text-gray-500 text-sm mt-2">Each team needs at least 2 players</p>
          )}
        </div>
      </div>
    );
  }

  // Individual mode
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4">
      <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white self-start mb-6">
        &larr; Back
      </button>
      <h1 className="text-3xl font-bold mb-8">Individual Setup</h1>
      {error && <p className="text-red-400 mb-4">{error}</p>}
      <div className="w-full max-w-xs">
        <input
          type="text"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startIndividualGame()}
          placeholder="Enter your Player ID"
          autoFocus
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white text-lg placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-blue-500 mb-4"
        />
        <button
          onClick={startIndividualGame}
          disabled={loading || !playerId.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xl font-semibold py-4 rounded-xl transition-colors"
        >
          {loading ? "Creating..." : "Start Game"}
        </button>
      </div>
    </div>
  );
}
