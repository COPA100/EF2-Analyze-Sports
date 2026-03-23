import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { GameSession, Shot, User, ZonePerformance, PlayerPerformance } from '../types';
import { getPointsForZone } from './scoring';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// --- Users ---

export async function createUser(playerId: string): Promise<string> {
  const existing = await getUserByPlayerId(playerId);
  if (existing) return existing.id!;

  const ref = await addDoc(collection(db, 'users'), {
    playerId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserByPlayerId(playerId: string): Promise<User | null> {
  const q = query(collection(db, 'users'), where('playerId', '==', playerId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as User;
}

// --- Game Sessions ---

export async function createGameSession(
  activityType: 'individual' | 'team',
  tableId: string,
  playerIds: string[],
  teams?: { a: string[]; b: string[] },
): Promise<string> {
  const emptyZonePerf: Record<string, ZonePerformance> = {};
  for (let z = 1; z <= 6; z++) {
    emptyZonePerf[String(z)] = { makes: 0, attempts: 0 };
  }

  const emptyPlayerPerf: Record<string, PlayerPerformance> = {};
  for (const pid of playerIds) {
    emptyPlayerPerf[pid] = { points: 0, shots: 0, makes: 0, accuracy: 0 };
  }

  const data: Record<string, unknown> = {
    activityType,
    tableId,
    playerIds,
    isCompleted: false,
    startTime: serverTimestamp(),
    totalPoints: 0,
    totalShots: 0,
    statsSummary: {
      zonePerformance: emptyZonePerf,
      playerPerformance: emptyPlayerPerf,
    },
  };

  if (teams) {
    data.teams = teams;
  }

  const ref = await addDoc(collection(db, 'gameSessions'), data);
  return ref.id;
}

export async function recordShot(
  gameId: string,
  playerId: string,
  activityType: 'individual' | 'team',
  shotFrom: number,
  result: 'make' | 'miss',
  shotNumber: number,
): Promise<void> {
  const pointsEarned = result === 'make' ? getPointsForZone(shotFrom) : 0;

  await addDoc(collection(db, 'shots'), {
    gameId,
    playerId,
    activityType,
    shotFrom,
    result,
    pointsEarned,
    shotNumber,
    timestamp: serverTimestamp(),
  });

  // Update game session stats
  const gameRef = doc(db, 'gameSessions', gameId);
  const gameSnap = await getDoc(gameRef);
  if (!gameSnap.exists()) return;

  const game = gameSnap.data() as GameSession;
  const zonePerf = { ...game.statsSummary.zonePerformance };
  const zoneKey = String(shotFrom);
  zonePerf[zoneKey] = {
    makes: (zonePerf[zoneKey]?.makes ?? 0) + (result === 'make' ? 1 : 0),
    attempts: (zonePerf[zoneKey]?.attempts ?? 0) + 1,
  };

  const playerPerf = { ...game.statsSummary.playerPerformance };
  const pp = playerPerf[playerId] ?? { points: 0, shots: 0, makes: 0, accuracy: 0 };
  const newMakes = pp.makes + (result === 'make' ? 1 : 0);
  const newShots = pp.shots + 1;
  playerPerf[playerId] = {
    points: pp.points + pointsEarned,
    shots: newShots,
    makes: newMakes,
    accuracy: newShots > 0 ? newMakes / newShots : 0,
  };

  await updateDoc(gameRef, {
    totalPoints: game.totalPoints + pointsEarned,
    totalShots: game.totalShots + 1,
    'statsSummary.zonePerformance': zonePerf,
    'statsSummary.playerPerformance': playerPerf,
  });
}

export async function completeGame(gameId: string): Promise<void> {
  const gameRef = doc(db, 'gameSessions', gameId);
  await updateDoc(gameRef, {
    isCompleted: true,
    endTime: serverTimestamp(),
  });
}

export function subscribeToGameSession(
  gameId: string,
  callback: (game: GameSession) => void,
): () => void {
  const gameRef = doc(db, 'gameSessions', gameId);
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as GameSession);
    }
  });
}

export function subscribeToShots(
  gameId: string,
  callback: (shots: Shot[]) => void,
): () => void {
  const q = query(
    collection(db, 'shots'),
    where('gameId', '==', gameId),
    orderBy('shotNumber', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const shots = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Shot));
    callback(shots);
  });
}

export async function getGameSession(gameId: string): Promise<GameSession | null> {
  const snap = await getDoc(doc(db, 'gameSessions', gameId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as GameSession;
}

export async function getGamesByPlayer(playerId: string): Promise<GameSession[]> {
  const q = query(
    collection(db, 'gameSessions'),
    where('playerIds', 'array-contains', playerId),
    orderBy('startTime', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GameSession));
}

export async function getShotsForGame(gameId: string): Promise<Shot[]> {
  const q = query(
    collection(db, 'shots'),
    where('gameId', '==', gameId),
    orderBy('shotNumber', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Shot));
}

export { Timestamp };
