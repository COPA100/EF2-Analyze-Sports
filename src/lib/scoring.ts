import type { Shot } from "../types";

export const ZONE_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 3,
};

export function getPointsForZone(zone: number): number {
  return ZONE_POINTS[zone] ?? 0;
}

/**
 * Get the next player for team play using alternating team round-robin.
 * Teams alternate turns. Each team has its own rotation index that wraps.
 * Players at 15 shots are removed from rotation.
 * When remaining shots = sum of minimums needed for under-quota players, only those are eligible.
 */
export function getNextPlayer(
  teams: { team1: string[]; team2: string[] },
  shots: Shot[],
  lastTeam: "team1" | "team2" | null,
  teamRotationIndex: { team1: number; team2: number }
): {
  playerId: string;
  team: "team1" | "team2";
  rotationIndex: { team1: number; team2: number };
} {
  // Determine which team shoots next
  const nextTeam =
    lastTeam === null ? "team1" : lastTeam === "team1" ? "team2" : "team1";

  const teamPlayers = teams[nextTeam];
  const teamShots = shots.filter((s) =>
    teamPlayers.includes(s.playerId)
  );
  const totalTeamShots = teamShots.length;
  const remainingTeamShots = 30 - totalTeamShots;

  // Count shots per player
  const shotCounts: Record<string, number> = {};
  for (const p of teamPlayers) shotCounts[p] = 0;
  for (const s of teamShots) shotCounts[s.playerId] = (shotCounts[s.playerId] || 0) + 1;

  // Players who haven't hit 15 yet
  let eligible = teamPlayers.filter((p) => shotCounts[p] < 15);

  // Check if we need to force under-quota players (< 5 shots)
  const underQuota = eligible.filter((p) => shotCounts[p] < 5);
  const minShotsNeeded = underQuota.reduce((sum, p) => sum + (5 - shotCounts[p]), 0);
  if (minShotsNeeded >= remainingTeamShots && underQuota.length > 0) {
    eligible = underQuota;
  }

  // Round-robin within eligible players
  let idx = teamRotationIndex[nextTeam];
  // Find next eligible player starting from current rotation index
  let playerId = eligible[0];
  for (let i = 0; i < teamPlayers.length; i++) {
    const candidate = teamPlayers[(idx + i) % teamPlayers.length];
    if (eligible.includes(candidate)) {
      playerId = candidate;
      idx = (idx + i + 1) % teamPlayers.length;
      break;
    }
  }

  return {
    playerId,
    team: nextTeam,
    rotationIndex: { ...teamRotationIndex, [nextTeam]: idx },
  };
}
