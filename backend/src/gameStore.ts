import {
  addPlayer,
  createGameState,
  resetGame,
  type GameState,
  type PlayerState
} from "@katrekat/game-core";
import type { Profile } from "./auth.js";
import { supabaseAdmin } from "./supabase.js";

export type GameParticipant = {
  userId: string;
  playerId: string;
  displayName: string;
  joinedAt: string;
};

type GameRow = {
  id: string;
  room_code: string;
  host_user_id: string;
  status: GameState["status"];
  range_max: number;
  sec_idx: number;
  turn_idx: number;
  state: GameState;
  participants: GameParticipant[];
  created_at: string;
  updated_at: string;
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

export type RoomMessage = {
  id: string;
  gameId: string;
  userId: string;
  playerName: string;
  messageText: string;
  createdAt: string;
};

type UpdateContext = {
  game: GameRow;
  participant: GameParticipant;
  isHost: boolean;
};

export async function createGameForHost(profile: Profile): Promise<ViewerGame> {
  const initialState = addPlayer(createGameState(), profile.displayName);
  const hostPlayer = initialState.players[0];

  if (!hostPlayer) {
    throw new Error("Unable to create the host player.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = createRoomCode();
    const now = new Date().toISOString();
    const participants: GameParticipant[] = [
      {
        userId: profile.id,
        playerId: hostPlayer.id,
        displayName: hostPlayer.name,
        joinedAt: now
      }
    ];

    const payload = toGamePayload({
      room_code: roomCode,
      host_user_id: profile.id,
      state: initialState,
      participants
    });

    const { data, error } = await supabaseAdmin
      .from("games")
      .insert(payload)
      .select("id, room_code, host_user_id, status, range_max, sec_idx, turn_idx, state, participants, created_at, updated_at")
      .single();

    if (!error && data) {
      return toViewerGame(data, profile.id);
    }

    if (error?.code !== "23505") {
      throw new Error(error?.message ?? "Unable to create the game.");
    }
  }

  throw new Error("Unable to generate a unique room code.");
}

export async function listGamesForUser(userId: string): Promise<GameSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("games")
    .select("id, room_code, host_user_id, status, range_max, sec_idx, turn_idx, state, participants, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((game) => hasParticipant(game, userId))
    .map((game) => ({
      id: game.id,
      roomCode: game.room_code,
      status: game.status,
      range: game.range_max,
      playerCount: game.state.players.length,
      isHost: game.host_user_id === userId,
      createdAt: game.created_at,
      updatedAt: game.updated_at
    }));
}

export async function getGameForUser(gameId: string, userId: string): Promise<ViewerGame> {
  const game = await readGame(gameId);
  ensureParticipant(game, userId);
  return toViewerGame(game, userId);
}

export async function joinGameByRoomCode(roomCode: string, profile: Profile): Promise<ViewerGame> {
  const normalizedCode = roomCode.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter a room code.");
  }

  const { data, error } = await supabaseAdmin
    .from("games")
    .select("id, room_code, host_user_id, status, range_max, sec_idx, turn_idx, state, participants, created_at, updated_at")
    .eq("room_code", normalizedCode)
    .single();

  if (error || !data) {
    throw new Error("Room not found.");
  }

  const existing = findParticipant(data, profile.id);
  if (existing) {
    return toViewerGame(data, profile.id);
  }

  if (data.state.status !== "setup") {
    throw new Error("This room is already in progress.");
  }

  const nextState = addPlayer(data.state, profile.displayName);
  const joinedPlayer = nextState.players[nextState.players.length - 1];

  if (!joinedPlayer) {
    throw new Error("Unable to join the room.");
  }

  const participants = [
    ...normalizeParticipants(data.participants),
    {
      userId: profile.id,
      playerId: joinedPlayer.id,
      displayName: joinedPlayer.name,
      joinedAt: new Date().toISOString()
    }
  ];

  const updated = await writeGame(data.id, {
    room_code: data.room_code,
    host_user_id: data.host_user_id,
    state: nextState,
    participants
  });

  return toViewerGame(updated, profile.id);
}

export async function updateGameForUser(
  gameId: string,
  userId: string,
  updater: (state: GameState, context: UpdateContext) => GameState
): Promise<ViewerGame> {
  const game = await readGame(gameId);
  const participant = ensureParticipant(game, userId);
  const nextState = updater(game.state, {
    game,
    participant,
    isHost: game.host_user_id === userId
  });

  const updated = await writeGame(game.id, {
    room_code: game.room_code,
    host_user_id: game.host_user_id,
    state: nextState,
    participants: normalizeParticipants(game.participants)
  });

  return toViewerGame(updated, userId);
}

export async function resetGameForHost(gameId: string, userId: string): Promise<ViewerGame> {
  return updateGameForUser(gameId, userId, (state, context) => {
    if (!context.isHost) {
      throw new Error("Only the host can reset the game.");
    }

    return resetGame(state);
  });
}

export async function listRoomMessagesForUser(gameId: string, userId: string): Promise<RoomMessage[]> {
  const game = await readGame(gameId);
  ensureParticipant(game, userId);

  const { data, error } = await supabaseAdmin
    .from("room_messages")
    .select("id, game_id, user_id, player_name, message_text, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    gameId: entry.game_id,
    userId: entry.user_id,
    playerName: entry.player_name,
    messageText: entry.message_text,
    createdAt: entry.created_at
  }));
}

export async function sendRoomMessageForUser(
  gameId: string,
  userId: string,
  messageInput: string
): Promise<RoomMessage> {
  const game = await readGame(gameId);
  const participant = ensureParticipant(game, userId);
  const messageText = messageInput.trim();

  if (!messageText) {
    throw new Error("Enter a chat message.");
  }

  if (messageText.length > 500) {
    throw new Error("Chat messages must be 500 characters or less.");
  }

  const { data, error } = await supabaseAdmin
    .from("room_messages")
    .insert({
      game_id: gameId,
      user_id: userId,
      player_name: participant.displayName,
      message_text: messageText
    })
    .select("id, game_id, user_id, player_name, message_text, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to send the message.");
  }

  return {
    id: data.id,
    gameId: data.game_id,
    userId: data.user_id,
    playerName: data.player_name,
    messageText: data.message_text,
    createdAt: data.created_at
  };
}

export function requireHost(context: UpdateContext) {
  if (!context.isHost) {
    throw new Error("Only the host can do that.");
  }
}

export function requireCurrentSecretPlayer(state: GameState, participant: GameParticipant): PlayerState {
  const activePlayer = state.players[state.secIdx];

  if (!activePlayer || activePlayer.id !== participant.playerId) {
    throw new Error("It is not your turn to enter a secret.");
  }

  return activePlayer;
}

export function requireCurrentTurnPlayer(state: GameState, participant: GameParticipant): PlayerState {
  const activePlayer = state.players[state.turn];

  if (!activePlayer || activePlayer.id !== participant.playerId) {
    throw new Error("It is not your turn.");
  }

  return activePlayer;
}

function ensureParticipant(game: GameRow, userId: string): GameParticipant {
  const participant = findParticipant(game, userId);

  if (!participant) {
    throw new Error("You are not part of this room.");
  }

  return participant;
}

function findParticipant(game: Pick<GameRow, "participants">, userId: string) {
  return normalizeParticipants(game.participants).find((participant) => participant.userId === userId);
}

function hasParticipant(game: Pick<GameRow, "participants">, userId: string): boolean {
  return Boolean(findParticipant(game, userId));
}

async function readGame(gameId: string): Promise<GameRow> {
  const { data, error } = await supabaseAdmin
    .from("games")
    .select("id, room_code, host_user_id, status, range_max, sec_idx, turn_idx, state, participants, created_at, updated_at")
    .eq("id", gameId)
    .single();

  if (error || !data) {
    throw new Error("Game not found.");
  }

  return normalizeGameRow(data);
}

async function writeGame(
  gameId: string,
  input: {
    room_code: string;
    host_user_id: string;
    state: GameState;
    participants: GameParticipant[];
  }
): Promise<GameRow> {
  const payload = {
    room_code: input.room_code,
    host_user_id: input.host_user_id,
    ...syncStateFields(input.state),
    participants: normalizeParticipants(input.participants),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from("games")
    .update(payload)
    .eq("id", gameId)
    .select("id, room_code, host_user_id, status, range_max, sec_idx, turn_idx, state, participants, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save the game.");
  }

  return normalizeGameRow(data);
}

function toGamePayload(input: {
  room_code: string;
  host_user_id: string;
  state: GameState;
  participants: GameParticipant[];
}) {
  return {
    room_code: input.room_code,
    host_user_id: input.host_user_id,
    ...syncStateFields(input.state),
    participants: normalizeParticipants(input.participants)
  };
}

function syncStateFields(state: GameState) {
  return {
    status: state.status,
    range_max: state.range,
    sec_idx: state.secIdx,
    turn_idx: state.turn,
    state
  };
}

function normalizeGameRow(data: GameRow): GameRow {
  return {
    ...data,
    participants: normalizeParticipants(data.participants)
  };
}

function normalizeParticipants(value: unknown): GameParticipant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const participant = entry as Record<string, unknown>;
      const userId = typeof participant.userId === "string" ? participant.userId : "";
      const playerId = typeof participant.playerId === "string" ? participant.playerId : "";
      const displayName = typeof participant.displayName === "string" ? participant.displayName : "";
      const joinedAt = typeof participant.joinedAt === "string" ? participant.joinedAt : new Date().toISOString();

      if (!userId || !playerId || !displayName) {
        return null;
      }

      return {
        userId,
        playerId,
        displayName,
        joinedAt
      };
    })
    .filter((participant): participant is GameParticipant => participant !== null);
}

function toViewerGame(game: GameRow, userId: string): ViewerGame {
  const participant = ensureParticipant(game, userId);

  return {
    id: game.id,
    roomCode: game.room_code,
    hostUserId: game.host_user_id,
    isHost: game.host_user_id === userId,
    viewerPlayerId: participant.playerId,
    viewerName: participant.displayName,
    state: maskStateForViewer(game.state, participant.playerId),
    createdAt: game.created_at,
    updatedAt: game.updated_at
  };
}

function maskStateForViewer(state: GameState, viewerPlayerId: string): GameState {
  const revealAllSecrets = state.status === "result";

  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      secret: revealAllSecrets || player.id === viewerPlayerId ? player.secret : null
    }))
  };
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";

  for (let index = 0; index < 6; index += 1) {
    roomCode += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return roomCode;
}
