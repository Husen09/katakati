import type { Session } from "@supabase/supabase-js";
import type { GameState } from "@katrekat/game-core";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type Profile = {
  id: string;
  email: string;
  displayName: string;
};

export type GameSummary = {
  id: string;
  roomCode: string;
  status: GameState["status"];
  range: number;
  playerCount: number;
  isHost: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ViewerGame = {
  id: string;
  roomCode: string;
  hostUserId: string;
  isHost: boolean;
  viewerPlayerId: string;
  viewerName: string;
  state: GameState;
  createdAt: string;
  updatedAt: string;
};

export async function getProfile(session: Session): Promise<Profile> {
  const response = await apiRequest<{ profile: Profile }>("/auth/me", { session });
  return response.profile;
}

export async function listGames(session: Session): Promise<GameSummary[]> {
  const response = await apiRequest<{ games: GameSummary[] }>("/games", { session });
  return response.games;
}

export async function createGame(session: Session): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>("/games", { method: "POST", session });
  return response.game;
}

export async function joinGame(session: Session, roomCode: string): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>("/games/join", {
    method: "POST",
    session,
    body: { roomCode }
  });
  return response.game;
}

export async function getGame(session: Session, gameId: string): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}`, { session });
  return response.game;
}

export async function updateRange(session: Session, gameId: string, range: number): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}/range`, {
    method: "POST",
    session,
    body: { range }
  });
  return response.game;
}

export async function startGame(session: Session, gameId: string): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}/start`, {
    method: "POST",
    session
  });
  return response.game;
}

export async function submitSecret(session: Session, gameId: string, secret: number): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}/secret`, {
    method: "POST",
    session,
    body: { secret }
  });
  return response.game;
}

export async function submitGuess(session: Session, gameId: string, number: number): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}/guess`, {
    method: "POST",
    session,
    body: { number }
  });
  return response.game;
}

export async function resetGame(session: Session, gameId: string): Promise<ViewerGame> {
  const response = await apiRequest<{ game: ViewerGame }>(`/games/${gameId}/reset`, {
    method: "POST",
    session
  });
  return response.game;
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    session: Session;
    body?: unknown;
  }
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.session.access_token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}
