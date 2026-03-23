import { Timestamp } from "firebase/firestore";

export interface User {
  playerId: string;
  createdAt: Timestamp;
}

export interface Shot {
  id?: string;
  gameId: string;
  playerId: string;
  activityType: "individual" | "team";
  shotFrom: number; // 1-6
  result: "make" | "miss";
  pointsEarned: number; // 0, 1, 2, or 3
  shotNumber: number;
  timestamp: Timestamp;
}

export interface GameSession {
  id?: string;
  activityType: "individual" | "team";
  playerIds: string[];
  teams?: { team1: string[]; team2: string[] };
  isCompleted: boolean;
  startTime: Timestamp;
  endTime?: Timestamp;
  totalShots: number;
  totalPoints: number;
}
