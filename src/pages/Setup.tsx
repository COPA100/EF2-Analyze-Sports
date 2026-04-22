import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, setDoc, addDoc, Timestamp, query, where, getDocs, getDoc } from "firebase/firestore";
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
  const [addingTeamPlayer, setAddingTeamPlayer] = useState<1 | 2 | null>(null);
  const [allPlayerIds, setAllPlayerIds] = useState<string[]>([]);
  const [focusedTeam, setFocusedTeam] = useState<1 | 2 | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "team") return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        setAllPlayerIds(snap.docs.map((d) => d.id));
      } catch (e) {
        console.error("Failed to load player IDs", e);
      }
    })();
  }, [mode]);

  function getSuggestions(team: 1 | 2): string[] {
    const input = (team === 1 ? team1Input : team2Input).trim().toLowerCase();
    if (!input) return [];
    const taken = new Set([...team1Players, ...team2Players]);
    return allPlayerIds
      .filter((id) => !taken.has(id) && id.toLowerCase().includes(input))
      .slice(0, 8);
  }

  function selectSuggestion(team: 1 | 2, id: string) {
    const otherPlayers = team === 1 ? team2Players : team1Players;
    const players = team === 1 ? team1Players : team2Players;
    if (players.includes(id) || otherPlayers.includes(id)) return;
    if (team === 1) {
      setTeam1Players([...team1Players, id]);
      setTeam1Input("");
    } else {
      setTeam2Players([...team2Players, id]);
      setTeam2Input("");
    }
    setError("");
  }

  async function ensureUser(id: string) {
    await setDoc(doc(db, "users", id), {
      playerId: id,
      createdAt: Timestamp.now(),
    }, { merge: true });
  }

  async function userExists(id: string) {
    const userSnap = await getDoc(doc(db, "users", id));
    return userSnap.exists();
  }

  async function startIndividualGame() {
    const id = playerId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      // Check for an existing incomplete individual game to resume
      const incompleteSnap = await getDocs(
        query(
          collection(db, "gameSessions"),
          where("activityType", "==", "individual"),
          where("playerIds", "array-contains", id),
          where("isCompleted", "==", false)
        )
      );
      if (!incompleteSnap.empty) {
        const existingGame = incompleteSnap.docs[0];
        navigate(`/play/${existingGame.id}`);
        return;
      }

      // Check if this player already played an individual game
      const existingSnap = await getDocs(
        query(
          collection(db, "gameSessions"),
          where("activityType", "==", "individual"),
          where("playerIds", "array-contains", id),
          where("isCompleted", "==", true)
        )
      );
      if (!existingSnap.empty) {
        setError(`Player "${id}" has already played their individual game.`);
        setLoading(false);
        return;
      }

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
      for (const id of allPlayers) {
        const exists = await userExists(id);
        if (!exists) {
          setError(`Player ID "${id}" must be created in Individual mode before team play.`);
          setLoading(false);
          return;
        }
      }
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

  async function addTeamPlayer(team: 1 | 2) {
    const input = team === 1 ? team1Input.trim() : team2Input.trim();
    if (!input) return;
    const players = team === 1 ? team1Players : team2Players;
    const otherPlayers = team === 1 ? team2Players : team1Players;
    if (players.includes(input) || otherPlayers.includes(input)) {
      setError("Player already added.");
      return;
    }
    setAddingTeamPlayer(team);
    setError("");
    try {
      const exists = await userExists(input);
      if (!exists) {
        setError(`Player ID "${input}" not found. They must play Individual mode first.`);
        return;
      }

      if (team === 1) {
        setTeam1Players([...team1Players, input]);
        setTeam1Input("");
      } else {
        setTeam2Players([...team2Players, input]);
        setTeam2Input("");
      }
    } catch (e) {
      setError("Could not validate player ID. Check your connection and try again.");
      console.error(e);
    } finally {
      setAddingTeamPlayer(null);
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
              <div className="relative flex-1">
                <input
                  type="text"
                  value={team1Input}
                  onChange={(e) => setTeam1Input(e.target.value)}
                  onFocus={() => setFocusedTeam(1)}
                  onBlur={() => setTimeout(() => setFocusedTeam((t) => (t === 1 ? null : t)), 150)}
                  onKeyDown={(e) => e.key === "Enter" && addTeamPlayer(1)}
                  placeholder="Player ID"
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-blue-500"
                />
                {focusedTeam === 1 && getSuggestions(1).length > 0 && (
                  <ul className="absolute top-full left-0 right-0 z-10 mt-1 bg-gray-800 border border-blue-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                    {getSuggestions(1).map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(1, id)}
                          className="w-full text-left px-3 py-2 text-white hover:bg-blue-900/60 transition-colors"
                        >
                          {id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => addTeamPlayer(1)}
                disabled={addingTeamPlayer === 1 || loading}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg font-semibold transition-colors"
              >
                {addingTeamPlayer === 1 ? "Checking..." : "Add"}
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
              <div className="relative flex-1">
                <input
                  type="text"
                  value={team2Input}
                  onChange={(e) => setTeam2Input(e.target.value)}
                  onFocus={() => setFocusedTeam(2)}
                  onBlur={() => setTimeout(() => setFocusedTeam((t) => (t === 2 ? null : t)), 150)}
                  onKeyDown={(e) => e.key === "Enter" && addTeamPlayer(2)}
                  placeholder="Player ID"
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus:ring-green-500"
                />
                {focusedTeam === 2 && getSuggestions(2).length > 0 && (
                  <ul className="absolute top-full left-0 right-0 z-10 mt-1 bg-gray-800 border border-green-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                    {getSuggestions(2).map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(2, id)}
                          className="w-full text-left px-3 py-2 text-white hover:bg-green-900/60 transition-colors"
                        >
                          {id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => addTeamPlayer(2)}
                disabled={addingTeamPlayer === 2 || loading}
                className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg font-semibold transition-colors"
              >
                {addingTeamPlayer === 2 ? "Checking..." : "Add"}
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
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white mb-6 block">
        &larr; Back
      </button>
      <h1 className="text-3xl font-bold text-center mb-8">Individual Setup</h1>
      {error && <p className="text-red-400 text-center mb-4">{error}</p>}
      <div className="w-full max-w-xs mx-auto">
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
