export const RANGES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

export type GameStatus = "setup" | "secret" | "guess" | "result";

export type PlayerState = {
  id: string;
  name: string;
  secret: number | null;
  guessedBy: string | null;
  hits: number;
};

export type BoardCell = {
  n: number;
  gone: boolean;
};

export type GameLog = {
  guesser: string;
  num: number;
  hit: boolean;
  msg: string;
};

export type ResultEntry = {
  playerId: string;
  playerName: string;
  secret: number | null;
  hits: number;
  status: "winner" | "loser";
  subtitle: string;
};

export type GameState = {
  status: GameStatus;
  range: number;
  players: PlayerState[];
  secIdx: number;
  turn: number;
  board: BoardCell[];
  logs: GameLog[];
};

export function createGameState(): GameState {
  return {
    status: "setup",
    range: 0,
    players: [],
    secIdx: 0,
    turn: 0,
    board: [],
    logs: []
  };
}

export function setRange(state: GameState, range: number): GameState {
  if (!RANGES.includes(range as (typeof RANGES)[number])) {
    throw new Error("Invalid range.");
  }

  return {
    ...state,
    range
  };
}

export function addPlayer(state: GameState, name: string): GameState {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Enter a name.");
  }

  if (state.players.some((player) => player.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("Name already taken.");
  }

  if (state.players.length >= 8) {
    throw new Error("Max 8 players.");
  }

  return {
    ...state,
    players: [
      ...state.players,
      {
        id: createPlayerId(trimmed, state.players.length),
        name: trimmed,
        secret: null,
        guessedBy: null,
        hits: 0
      }
    ]
  };
}

export function removePlayer(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.filter((player) => player.id !== playerId)
  };
}

export function startSecretPhase(state: GameState): GameState {
  if (!state.range) {
    throw new Error("Please choose a number range.");
  }

  if (state.players.length < 2) {
    throw new Error("Add at least 2 players.");
  }

  return {
    ...state,
    status: "secret",
    secIdx: 0
  };
}

export function saveSecret(state: GameState, value: number): GameState {
  if (state.status !== "secret") {
    throw new Error("Secrets can only be saved during the secret phase.");
  }

  if (!Number.isInteger(value) || value < 1 || value > state.range) {
    throw new Error(`Enter a number between 1 and ${state.range}.`);
  }

  const currentPlayer = state.players[state.secIdx];
  if (!currentPlayer) {
    throw new Error("No active player for secret selection.");
  }

  const isTaken = state.players.some((player, index) => index !== state.secIdx && player.secret === value);
  if (isTaken) {
    throw new Error("Already taken! Choose another.");
  }

  const players = state.players.map((player, index) =>
    index === state.secIdx ? { ...player, secret: value } : player
  );

  if (state.secIdx < players.length - 1) {
    return {
      ...state,
      players,
      secIdx: state.secIdx + 1
    };
  }

  return startGuessPhase({
    ...state,
    players
  });
}

export function startGuessPhase(state: GameState): GameState {
  return {
    ...state,
    status: "guess",
    turn: 0,
    logs: [],
    board: Array.from({ length: state.range }, (_, index) => ({
      n: index + 1,
      gone: false
    }))
  };
}

export function makeGuess(state: GameState, num: number): GameState {
  if (state.status !== "guess") {
    throw new Error("Guesses can only be made during the guess phase.");
  }

  const player = state.players[state.turn];
  if (!player) {
    throw new Error("No active player for this turn.");
  }

  const cell = state.board.find((entry) => entry.n === num);
  if (!cell || cell.gone) {
    throw new Error("That number is no longer available.");
  }

  const board = state.board.map((entry) => (entry.n === num ? { ...entry, gone: true } : entry));
  const matched = state.players.find(
    (target) => target.id !== player.id && target.secret === num && !target.guessedBy
  );

  let msg = "";
  let hit = false;

  const players = state.players.map((entry) => {
    if (matched && entry.id === matched.id) {
      return {
        ...entry,
        guessedBy: player.name
      };
    }

    if (matched && entry.id === player.id) {
      return {
        ...entry,
        hits: entry.hits + 1
      };
    }

    return entry;
  });

  if (matched) {
    hit = true;
    msg = `${player.name} found ${matched.name}'s secret: ${num}!`;
  } else if (player.secret === num) {
    msg = `${player.name} hit their own number ${num} - removed.`;
  } else {
    msg = `${player.name} picked ${num} - no match. Removed.`;
  }

  const logs = [
    ...state.logs,
    {
      guesser: player.name,
      num,
      hit,
      msg
    }
  ];

  const nextState: GameState = {
    ...state,
    players,
    board,
    logs
  };

  if (isGameOver(nextState)) {
    return {
      ...nextState,
      status: "result"
    };
  }

  return {
    ...nextState,
    turn: (state.turn + 1) % state.players.length
  };
}

export function isGameOver(state: GameState): boolean {
  const alive = state.players.filter((player) => !player.guessedBy);
  const remaining = state.board.filter((cell) => !cell.gone);
  return alive.length <= 1 || remaining.length === 0;
}

export function getResults(state: GameState): ResultEntry[] {
  const found = state.players.filter((player) => player.guessedBy);
  const survivors = state.players.filter((player) => !player.guessedBy);

  const winnerEntries = found.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    secret: player.secret,
    hits: player.hits,
    status: "winner" as const,
    subtitle: `Secret ${player.secret} was found - ${player.hits} hit${player.hits === 1 ? "" : "s"}`
  }));

  const loserEntries = survivors.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    secret: player.secret,
    hits: player.hits,
    status: "loser" as const,
    subtitle: `Secret ${player.secret} - nobody guessed it`
  }));

  return [...winnerEntries, ...loserEntries];
}

export function resetGame(state: GameState): GameState {
  return {
    ...createGameState(),
    players: state.players.map((player) => ({
      ...player,
      secret: null,
      guessedBy: null,
      hits: 0
    }))
  };
}

function createPlayerId(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${base || "player"}-${index + 1}`;
}
