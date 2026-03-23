import { Timestamp } from 'firebase/firestore';

export interface User {
  id?: string;
  playerId: string;
  name?: string;
  currentTableId?: string;
  createdAt: Timestamp;
}

export interface Shot {
  id?: string;
  gameId: string;
  playerId: string;
  activityType: 'individual' | 'team';
  shotFrom: number;
  result: 'make' | 'miss';
  pointsEarned: number;
  shotNumber: number;
  timestamp: Timestamp;
}

export interface ZonePerformance {
  makes: number;
  attempts: number;
}

export interface PlayerPerformance {
  points: number;
  shots: number;
  makes: number;
  accuracy: number;
}

export interface GameSession {
  id?: string;
  activityType: 'individual' | 'team';
  tableId: string;
  playerIds: string[];
  isCompleted: boolean;
  startTime: Timestamp;
  endTime?: Timestamp;
  totalPoints: number;
  totalShots: number;
  teams?: {
    a: string[];
    b: string[];
  };
  statsSummary: {
    zonePerformance: Record<string, ZonePerformance>;
    playerPerformance: Record<string, PlayerPerformance>;
  };
}

export type TeamKey = 'a' | 'b';

export type ActivityType = 'individual' | 'team';
export type ShotResult = 'make' | 'miss';
