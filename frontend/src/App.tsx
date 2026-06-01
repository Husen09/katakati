import { useEffect, useMemo, useState } from "react";
import { RANGES, getResults, type GameState } from "@katrekat/game-core";
import type { Session } from "@supabase/supabase-js";
import { createGame, getGame, getProfile, joinGame, listGames, resetGame, startGame, submitGuess, submitSecret, type GameSummary, type Profile, type ViewerGame, updateRange } from "./api";
import { supabase } from "./supabase";

type Feedback = { error: string; ok: string };

const emptyState: GameState = { status: "setup", range: 0, players: [], secIdx: 0, turn: 0, board: [], logs: [] };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [activeGame, setActiveGame] = useState<ViewerGame | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ error: "", ok: "Sign in to create or join a live room." });

  const state = activeGame?.state ?? emptyState;
  const results = useMemo(() => getResults(state), [state]);
  const activeSecretPlayer = state.players[state.secIdx];
  const activeTurnPlayer = state.players[state.turn];
  const isSignedIn = Boolean(session && profile);
  const isViewerTurnForSecret = Boolean(activeGame && activeSecretPlayer?.id === activeGame.viewerPlayerId);
  const isViewerTurnForGuess = Boolean(activeGame && activeTurnPlayer?.id === activeGame.viewerPlayerId);

  useEffect(() => {
    let alive = true;

    async function boot() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(currentSession);
      setLoading(false);
      if (currentSession) {
        await refreshProfile(currentSession, alive);
        await refreshGames(currentSession, alive);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setGames([]);
      setActiveGame(null);
      if (nextSession) {
        void refreshProfile(nextSession, true);
        void refreshGames(nextSession, true);
      }
    });

    void boot();
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !activeGame) return;
    const interval = window.setInterval(() => {
      void refreshActiveGame(session, activeGame.id, true);
      void refreshGames(session, true);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [session, activeGame?.id]);

  async function refreshProfile(currentSession: Session, alive = true) {
    try {
      const nextProfile = await getProfile(currentSession);
      if (alive) setProfile(nextProfile);
    } catch (error) {
      setFeedback({ error: errorMessage(error), ok: "" });
    }
  }

  async function refreshGames(currentSession: Session, alive = true) {
    try {
      const nextGames = await listGames(currentSession);
      if (alive) setGames(nextGames);
    } catch (error) {
      setFeedback({ error: errorMessage(error), ok: "" });
    }
  }

  async function refreshActiveGame(currentSession: Session, gameId: string, silent = false) {
    try {
      setActiveGame(await getGame(currentSession, gameId));
    } catch (error) {
      if (!silent) setFeedback({ error: errorMessage(error), ok: "" });
    }
  }

  async function run(task: () => Promise<void>, successMessage = "") {
    try {
      setBusy(true);
      await task();
      if (successMessage) setFeedback({ error: "", ok: successMessage });
    } catch (error) {
      setFeedback({ error: errorMessage(error), ok: "" });
    } finally {
      setBusy(false);
    }
  }

  function latestLog(nextState?: GameState) {
    const source = nextState ?? activeGame?.state ?? state;
    return source.logs[source.logs.length - 1]?.msg ?? "";
  }

  async function handleAuthSubmit() {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
      if (error) throw error;
      if (!data.session) {
        setFeedback({ error: "", ok: "Signup worked. If email confirmation is enabled in Supabase, confirm your email and then sign in." });
        return;
      }
      setSession(data.session);
      await refreshProfile(data.session);
      await refreshGames(data.session);
      setPassword("");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error("Unable to sign in.");
    setSession(data.session);
    await refreshProfile(data.session);
    await refreshGames(data.session);
    setPassword("");
  }

  async function handleCreateGame() {
    if (!session) throw new Error("Please sign in first.");
    setActiveGame(await createGame(session));
    await refreshGames(session);
  }

  async function handleJoinGame() {
    if (!session) throw new Error("Please sign in first.");
    setActiveGame(await joinGame(session, joinCode));
    setJoinCode("");
    await refreshGames(session);
  }

  async function handleOpenGame(gameId: string) {
    if (!session) throw new Error("Please sign in first.");
    await refreshActiveGame(session, gameId);
  }

  async function handleUpdateRange(range: number) {
    if (!session || !activeGame) return;
    setActiveGame(await updateRange(session, activeGame.id, range));
    await refreshGames(session);
  }

  async function handleStartGame() {
    if (!session || !activeGame) return;
    setActiveGame(await startGame(session, activeGame.id));
    await refreshGames(session);
  }

  async function handleSubmitSecret() {
    if (!session || !activeGame) return;
    setActiveGame(await submitSecret(session, activeGame.id, Number(secretValue)));
    setSecretValue("");
    await refreshGames(session);
  }

  async function handleSubmitGuess(number: number) {
    if (!session || !activeGame) return;
    const game = await submitGuess(session, activeGame.id, number);
    setActiveGame(game);
    await refreshGames(session);
    setFeedback({ error: "", ok: latestLog(game.state) });
  }

  async function handleResetGame() {
    if (!session || !activeGame) return;
    setActiveGame(await resetGame(session, activeGame.id));
    await refreshGames(session);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setGames([]);
    setActiveGame(null);
    setFeedback({ error: "", ok: "Signed out." });
  }

  if (loading) {
    return <main className="page"><section className="panel"><p className="hero-copy">Connecting to the room service...</p></section></main>;
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="hero">
          <p className="eyebrow">Online Multiplayer</p>
          <h1>Number Guess</h1>
          <p className="hero-copy">Live rooms with simple Supabase login, ready for Netlify and Render.</p>
        </header>

        {!isSignedIn && <div className="stack"><div className="card"><div className="split"><div><p className="section-label">Access</p><h2>{authMode === "login" ? "Sign in" : "Create account"}</h2></div><button className="ghost" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Need an account?" : "Already have an account?"}</button></div><div className="stack compact">{authMode === "signup" && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />}<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" /><button disabled={busy} onClick={() => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created.")}>{authMode === "login" ? "Sign in" : "Create account"}</button></div></div></div>}

        {isSignedIn && !activeGame && <div className="stack"><div className="card"><div className="split"><div><p className="section-label">Lobby</p><h2>Welcome, {profile?.displayName}</h2></div><button className="ghost" onClick={() => run(handleLogout)}>Sign out</button></div><div className="actions"><button disabled={busy} onClick={() => run(handleCreateGame, "Room created.")}>Create room</button><div className="row"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Room code" /><button disabled={busy} onClick={() => run(handleJoinGame, "Joined room.")}>Join room</button></div></div></div><div className="card"><div className="split"><h2>Your rooms</h2><button className="ghost" disabled={busy} onClick={() => session && run(() => refreshGames(session), "Rooms refreshed.")}>Refresh</button></div>{games.length === 0 && <p className="hero-copy">No rooms yet. Create one or join with a code.</p>}<div className="list">{games.map((game) => <button className="list-item interactive" key={game.id} onClick={() => run(() => handleOpenGame(game.id))}><span><strong>{game.roomCode}</strong></span><span>{game.playerCount} players</span><span>{game.status}</span><span>{game.isHost ? "Host" : "Joined"}</span></button>)}</div></div></div>}

        {isSignedIn && activeGame && <div className="stack"><div className="card"><div className="split"><div><p className="section-label">Room</p><h2>{activeGame.roomCode}</h2></div><div className="actions-inline"><button className="ghost" disabled={busy} onClick={() => session && run(() => refreshActiveGame(session, activeGame.id), "Room refreshed.")}>Refresh</button><button className="ghost" onClick={() => setActiveGame(null)}>Back to lobby</button></div></div><p className="hero-copy">Signed in as <strong>{activeGame.viewerName}</strong>. {activeGame.isHost ? "You are the host." : "Waiting on the host for room setup."}</p></div>

          {state.status === "setup" && <><div className="card"><div className="split"><h2>Choose range</h2><span className="badge">{state.range ? `1 - ${state.range}` : "Not chosen"}</span></div><div className="range-grid">{RANGES.map((range) => <button key={range} disabled={!activeGame.isHost || busy} className={state.range === range ? "chip chip-active" : "chip"} onClick={() => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`)}>1 - {range}</button>)}</div></div><div className="card"><div className="split"><h2>Players</h2><span className="badge">{state.players.length}/8</span></div><div className="list">{state.players.map((player, index) => <div className="list-item" key={player.id}><span>{index + 1}. {player.name}</span><span>{player.id === activeGame.viewerPlayerId ? "You" : "Joined"}</span></div>)}</div></div><button className="primary" disabled={!activeGame.isHost || busy} onClick={() => run(handleStartGame, "Secret phase started.")}>Start game</button></>}

          {state.status === "secret" && activeSecretPlayer && <div className="card"><h2>Secret entry</h2><p>Player {state.secIdx + 1} of {state.players.length}: <strong>{activeSecretPlayer.name}</strong></p>{isViewerTurnForSecret ? <div className="row"><input type="number" min={1} max={state.range} value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder={`1 to ${state.range}`} /><button disabled={busy} onClick={() => run(handleSubmitSecret, "Secret locked in.")}>Lock in</button></div> : <p className="hero-copy">Waiting for {activeSecretPlayer.name} to choose a secret number.</p>}</div>}

          {state.status === "guess" && activeTurnPlayer && <><div className="card"><h2>Guess phase</h2><p>Current turn: <strong>{activeTurnPlayer.name}</strong></p><p>Range: 1 - {state.range}</p><p className="hero-copy">{isViewerTurnForGuess ? "Pick a number from the board." : `Waiting for ${activeTurnPlayer.name} to move.`}</p></div><div className="card"><h2>Board</h2><div className="board">{state.board.map((cell) => <button key={cell.n} disabled={cell.gone || !isViewerTurnForGuess || busy} className={cell.gone ? "number number-gone" : "number"} onClick={() => run(() => handleSubmitGuess(cell.n))}>{cell.gone ? "" : cell.n}</button>)}</div></div><div className="card"><h2>Players</h2><div className="list">{state.players.map((player) => <div className="list-item" key={player.id}><span>{player.name}</span><span>{player.guessedBy ? `Found by ${player.guessedBy}` : "Still hiding"}</span></div>)}</div></div></>}

          {state.status === "result" && <><div className="card"><h2>Results</h2><div className="list">{results.map((result) => <div className="result" key={result.playerId}><strong>{result.playerName}</strong><span>{result.status.toUpperCase()}</span><p>{result.subtitle}</p></div>)}</div></div><button className="primary" disabled={!activeGame.isHost || busy} onClick={() => run(handleResetGame, "Game reset for another round.")}>Play again</button></>}
        </div>}

        {feedback.error && <p className="message error">{feedback.error}</p>}
        {!feedback.error && (feedback.ok || latestLog()) && <p className="message ok">{feedback.ok || latestLog()}</p>}
      </section>
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}
