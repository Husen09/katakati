import { useEffect, useMemo, useState, useRef } from "react";
import { RANGES, getResults, type GameState } from "@katrekat/game-core";
import type { Session } from "@supabase/supabase-js";
import {
  createGame,
  getGame,
  getProfile,
  joinGame,
  listGames,
  listRoomMessages,
  resetGame,
  sendRoomMessage,
  startGame,
  submitGuess,
  submitSecret,
  type GameSummary,
  type Profile,
  type RoomMessage,
  type ViewerGame,
  updateRange,
  updatePurpose
} from "./api";
import { supabase } from "./supabase";

function getPlayerColor(playerName: string, players: { name: string }[]) {
  const index = players.findIndex(p => p.name.toLowerCase() === playerName.toLowerCase());
  const colors = [
    "#00e5ff", // Cyber Cyan
    "#ec4899", // Pink
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#a855f7", // Purple
    "#ef4444", // Red/Rose
    "#3b82f6", // Blue
    "#eab308"  // Yellow
  ];
  if (index === -1) {
    let hash = 0;
    for (let i = 0; i < playerName.length; i++) {
      hash = playerName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
  return colors[index % colors.length];
}

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
  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ error: "", ok: "Sign in to create or join a live room." });

  const [selectedPurpose, setSelectedPurpose] = useState("TimePass");
  const [customPurpose, setCustomPurpose] = useState("");
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purposeValue, setPurposeValue] = useState("");

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const state = activeGame?.state ?? emptyState;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, nextSession: any) => {
      setSession(nextSession);
      setProfile(null);
      setGames([]);
      setActiveGame(null);
      setMessages([]);
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
      void refreshMessages(session, activeGame.id, true);
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

  async function refreshMessages(currentSession: Session, gameId: string, silent = false) {
    try {
      setMessages(await listRoomMessages(currentSession, gameId));
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
    const finalPurpose = selectedPurpose === "Custom" ? (customPurpose.trim() || "Custom Plan") : selectedPurpose;
    const game = await createGame(session, finalPurpose);
    setActiveGame(game);
    await refreshMessages(session, game.id, true);
    await refreshGames(session);
  }

  async function handleUpdatePurpose(purpose: string) {
    if (!session || !activeGame) return;
    setActiveGame(await updatePurpose(session, activeGame.id, purpose));
    await refreshGames(session);
  }

  async function handleJoinGame() {
    if (!session) throw new Error("Please sign in first.");
    const game = await joinGame(session, joinCode);
    setActiveGame(game);
    setJoinCode("");
    await refreshMessages(session, game.id, true);
    await refreshGames(session);
  }

  async function handleOpenGame(gameId: string) {
    if (!session) throw new Error("Please sign in first.");
    await refreshActiveGame(session, gameId);
    await refreshMessages(session, gameId, true);
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

  async function handleSendRoomMessage() {
    if (!session || !activeGame) return;
    await sendRoomMessage(session, activeGame.id, chatMessage);
    setChatMessage("");
    await refreshMessages(session, activeGame.id, true);
  }

  async function handleShareRoomCode() {
    if (!activeGame) return;

    if (navigator.share) {
      await navigator.share({
        title: "Join my Number Guess room",
        text: `Use room code ${activeGame.roomCode} to join Number Guess.`
      });
      setFeedback({ error: "", ok: "Share sheet opened." });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(activeGame.roomCode);
      setFeedback({ error: "", ok: "Room code copied." });
      return;
    }

    setFeedback({ error: "", ok: `Room code: ${activeGame.roomCode}` });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setGames([]);
    setActiveGame(null);
    setMessages([]);
    setFeedback({ error: "", ok: "Signed out." });
  }

  if (loading) {
    return (
      <main className="page">
        <section className="panel" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <span className="dot pulse" style={{ width: "16px", height: "16px" }}></span>
            <p className="hero-copy" style={{ margin: 0, fontWeight: 600 }}>Syncing room service link...</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="hero">
          <p className="eyebrow">Online Multiplayer Arena</p>
          <h1>Number Guess</h1>
        </header>

        {!isSignedIn && (
          <div className="stack">
            <div className="card" style={{ maxWidth: "480px", margin: "0 auto", width: "100%" }}>
              <div className="auth-title-container">
                <p className="section-label">Security Portal</p>
                <h2 style={{ fontSize: "24px", margin: "6px 0" }}>
                  {authMode === "login" ? "Welcome Back" : "Initiate Account"}
                </h2>
              </div>
              <div className="stack compact" style={{ marginTop: "20px" }}>
                {authMode === "signup" && (
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Gamer handle / Display name"
                  />
                )}
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email Address"
                  type="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !busy) {
                      void run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created.");
                    }
                  }}
                />
                <button
                  disabled={busy}
                  style={{ marginTop: "10px" }}
                  onClick={() => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created.")}
                >
                  {authMode === "login" ? "Enter Arena" : "Register Handle"}
                </button>
                <div style={{ textAlign: "center", marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }}>
                  {authMode === "login" ? "New recruit? " : "Already registered? "}
                  <button
                    className="auth-swap-button"
                    onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                  >
                    {authMode === "login" ? "Create an account" : "Sign in here"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isSignedIn && !activeGame && (
          <div className="stack">
            <div className="card">
              <div className="split">
                <div>
                  <p className="section-label">Lobby Control</p>
                  <h2>Welcome, {profile?.displayName}</h2>
                </div>
                <button className="ghost" onClick={() => run(handleLogout)}>Sign out</button>
              </div>

              <div className="actions" style={{ marginTop: "20px" }}>
                <div className="purpose-selection-container">
                  <span className="section-label" style={{ display: "block", marginBottom: "8px" }}>Purpose to play:</span>
                  <div className="purpose-presets">
                    {[
                      { key: "Tea", label: "🍵 Tea" },
                      { key: "Breakfast", label: "🍳 Breakfast" },
                      { key: "Party", label: "🎉 Party" },
                      { key: "TimePass", label: "🎮 TimePass" },
                      { key: "Custom", label: "✍️ Custom Plan" }
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={selectedPurpose === item.key ? "purpose-chip active" : "purpose-chip"}
                        onClick={() => setSelectedPurpose(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {selectedPurpose === "Custom" && (
                    <input
                      value={customPurpose}
                      onChange={(e) => setCustomPurpose(e.target.value)}
                      placeholder="Enter custom purpose..."
                      className="custom-purpose-input"
                      maxLength={50}
                      style={{ width: "100%", marginTop: "10px" }}
                    />
                  )}
                </div>

                <button disabled={busy} className="primary" onClick={() => run(handleCreateGame, "Room created.")}>
                  Create room
                </button>

                <div className="divider-line">
                  <span>OR JOIN WITH CODE</span>
                </div>

                <div className="row">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="Room code"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !busy) {
                        void run(handleJoinGame, "Joined room.");
                      }
                    }}
                  />
                  <button disabled={busy} onClick={() => run(handleJoinGame, "Joined room.")}>
                    Join room
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="split">
                <h2>Your Rooms</h2>
                <button className="ghost" disabled={busy} onClick={() => session && run(() => refreshGames(session), "Rooms refreshed.")}>
                  Refresh
                </button>
              </div>
              {games.length === 0 && <p className="hero-copy" style={{ textAlign: "center", margin: "24px 0" }}>No rooms yet. Create one or join with a code.</p>}
              <div className="list">
                {games.map((game) => (
                  <button className="list-item interactive" key={game.id} onClick={() => run(() => handleOpenGame(game.id))}>
                    <span><strong>{game.roomCode}</strong></span>
                    <span>{game.playerCount} players</span>
                    <span className={`badge status-${game.status}`}>{game.status}</span>
                    <span>{game.isHost ? "👑 Host" : "Joined"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isSignedIn && activeGame && (
          <div className="active-room-layout">
            <div className="stack">
              {state.status === "setup" && (
                <div className="card">
                  <div className="split" style={{ marginBottom: "12px" }}>
                    <h2>⚙️ Choose Number Range</h2>
                    <span className="badge status-setup">{state.range ? `1 - ${state.range}` : "Not chosen"}</span>
                  </div>
                  <p className="hero-copy" style={{ marginBottom: "20px" }}>
                    Select the range limit. Players will submit their secrets and play guessing sweeps in this scope.
                  </p>
                  <div className="range-grid">
                    {RANGES.map((range) => (
                      <button
                        key={range}
                        disabled={!activeGame.isHost || busy}
                        className={state.range === range ? "chip chip-active" : "chip"}
                        onClick={() => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`)}
                      >
                        1 - {range}
                      </button>
                    ))}
                  </div>
                  {activeGame.isHost && (
                    <button
                      className="primary"
                      style={{ marginTop: "24px" }}
                      disabled={!state.range || state.players.length < 2 || busy}
                      onClick={() => run(handleStartGame, "Secret phase started.")}
                    >
                      🚀 Start game
                    </button>
                  )}
                </div>
              )}

              {state.status === "secret" && activeSecretPlayer && (
                <div className="card">
                  <h2>🔑 Secret Entry Phase</h2>
                  <p style={{ fontSize: "16px", margin: "8px 0 16px" }}>
                    Player {state.secIdx + 1} of {state.players.length}:{" "}
                    <strong style={{ color: getPlayerColor(activeSecretPlayer.name, state.players), textShadow: `0 0 8px ${getPlayerColor(activeSecretPlayer.name, state.players)}40` }}>
                      {activeSecretPlayer.name}
                    </strong>
                  </p>
                  {isViewerTurnForSecret ? (
                    <div className="stack compact">
                      <p className="hero-copy" style={{ margin: 0 }}>
                        Enter your secret number between <strong>1</strong> and <strong>{state.range}</strong>. Keep it hidden!
                      </p>
                      <div className="row">
                        <input
                          type="number"
                          min={1}
                          max={state.range}
                          value={secretValue}
                          onChange={(event) => setSecretValue(event.target.value)}
                          placeholder={`1 to ${state.range}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !busy) {
                              void run(handleSubmitSecret, "Secret locked in.");
                            }
                          }}
                        />
                        <button disabled={busy || !secretValue} onClick={() => run(handleSubmitSecret, "Secret locked in.")}>
                          Lock Secret
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(0, 0, 0, 0.15)", padding: "16px", borderRadius: "12px" }}>
                      <span className="dot pulse" style={{ backgroundColor: getPlayerColor(activeSecretPlayer.name, state.players) }}></span>
                      <p className="hero-copy" style={{ margin: 0 }}>
                        Waiting for <strong>{activeSecretPlayer.name}</strong> to enter their secret number...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {state.status === "guess" && activeTurnPlayer && (() => {
                const viewerPlayer = state.players.find((p) => p.id === activeGame.viewerPlayerId);
                const viewerSecret = viewerPlayer?.secret;
                const nextTurnIndex = (state.turn + 1) % state.players.length;
                const nextPlayer = state.players[nextTurnIndex];

                return (
                  <>
                    <div className={`card turn-dashboard ${isViewerTurnForGuess ? "turn-active-glow" : ""}`}>
                      <div className="split">
                        <div>
                          <h2>🎯 Guess Phase</h2>
                          <p className="hero-copy" style={{ margin: "4px 0 0" }}>
                            Range: <strong>1 - {state.range}</strong>
                          </p>
                        </div>
                        <div className="turn-indicators">
                          <div className="turn-indicator-badge active-turn">
                            <span className="dot pulse" style={{ backgroundColor: getPlayerColor(activeTurnPlayer.name, state.players) }}></span>
                            Active: <strong style={{ color: getPlayerColor(activeTurnPlayer.name, state.players), marginLeft: "4px" }}>{activeTurnPlayer.name}</strong> {isViewerTurnForGuess && "(You)"}
                          </div>
                          {nextPlayer && (
                            <div className="turn-indicator-badge next-turn">
                              Next: <strong style={{ color: getPlayerColor(nextPlayer.name, state.players), marginLeft: "4px" }}>{nextPlayer.name}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="turn-instructions" style={{ marginTop: "16px", color: isViewerTurnForGuess ? "var(--color-cyan)" : "var(--text-muted)" }}>
                        {isViewerTurnForGuess ? (
                          <span>🎯 <strong>It's your turn!</strong> Choose an available number from the grid below.</span>
                        ) : (
                          <span>⏳ Waiting for <strong>{activeTurnPlayer.name}</strong> to make a guess.</span>
                        )}
                      </p>
                    </div>

                    <div className="card">
                      <div className="split" style={{ marginBottom: "16px" }}>
                        <h2>Radar Grid</h2>
                        {viewerSecret !== undefined && viewerSecret !== null && (
                          <span className="badge secret-badge">🔑 Your Secret: {viewerSecret}</span>
                        )}
                      </div>
                      <div className="board">
                        {state.board.map((cell) => {
                          const isOwnSecret = cell.n === viewerSecret;
                          return (
                            <button
                              key={cell.n}
                              disabled={cell.gone || !isViewerTurnForGuess || isOwnSecret || busy}
                              className={
                                cell.gone
                                  ? "number number-gone"
                                  : isOwnSecret
                                  ? "number number-own-secret"
                                  : "number"
                              }
                              onClick={() => run(() => handleSubmitGuess(cell.n))}
                              title={isOwnSecret ? "Your secret number (locked)" : undefined}
                            >
                              {cell.gone ? "" : isOwnSecret ? `🔒 ${cell.n}` : cell.n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}

              {state.status === "result" && (
                <div className="card">
                  <h2>🏆 Battle Results</h2>
                  <div className="list" style={{ margin: "16px 0" }}>
                    {results.map((result) => {
                      const isWinner = result.status === "winner";
                      return (
                        <div key={result.playerId} className={`result ${isWinner ? "winner-border" : "loser-border"}`}>
                          <div className="split">
                            <span 
                              style={{ 
                                fontWeight: 800, 
                                fontSize: "16px",
                                color: getPlayerColor(result.playerName, state.players),
                                textShadow: `0 0 8px ${getPlayerColor(result.playerName, state.players)}30`
                              }}
                            >
                              {result.playerName}
                            </span>
                            <span className={`result-status ${result.status}`}>
                              {isWinner ? "🥇 Winner" : "💀 Eliminated"}
                            </span>
                          </div>
                          <p className="hero-copy" style={{ margin: "6px 0 0", fontSize: "14px" }}>
                            {result.subtitle}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {activeGame.isHost && (
                    <button className="primary" disabled={busy} onClick={() => run(handleResetGame, "Game reset for another round.")}>
                      Play again
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="stack">
              <div className="card">
                <div className="split" style={{ marginBottom: "12px" }}>
                  <div>
                    <p className="section-label">Room ID</p>
                    <h2 style={{ fontSize: "24px", margin: 0, color: "var(--color-cyan)" }}>{activeGame.roomCode}</h2>
                  </div>
                </div>
                <div className="stack compact" style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                  <p style={{ margin: 0 }}>
                    Signed in as{" "}
                    <strong style={{ color: getPlayerColor(activeGame.viewerName, state.players), textShadow: `0 0 6px ${getPlayerColor(activeGame.viewerName, state.players)}30` }}>
                      {activeGame.viewerName}
                    </strong>
                  </p>
                  <p style={{ margin: 0 }}>
                    {activeGame.isHost ? "👑 Room Host (You)" : "🎮 Joined"}
                  </p>
                </div>
                <div className="actions-inline" style={{ marginTop: "18px" }}>
                  <button className="ghost compact-btn" onClick={() => run(handleShareRoomCode)}>Copy Code</button>
                  <button className="ghost compact-btn" disabled={busy} onClick={() => session && run(async () => { await refreshActiveGame(session, activeGame.id); await refreshMessages(session, activeGame.id, true); }, "Room refreshed.")}>Refresh</button>
                  <button className="ghost compact-btn" onClick={() => { setActiveGame(null); setMessages([]); }}>Lobby</button>
                </div>
              </div>

              <div className="card room-purpose-card">
                <span className="section-label">🎯 Room Purpose</span>
                <div style={{ marginTop: "8px" }}>
                  {editingPurpose ? (
                    <div className="stack compact">
                      <input
                        value={purposeValue}
                        onChange={(e) => setPurposeValue(e.target.value)}
                        placeholder="Enter room purpose..."
                        maxLength={50}
                      />
                      <div className="row">
                        <button className="compact-btn" onClick={() => run(async () => {
                          await handleUpdatePurpose(purposeValue);
                          setEditingPurpose(false);
                        }, "Purpose updated.")}>Save</button>
                        <button className="compact-btn ghost" onClick={() => setEditingPurpose(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <span className="purpose-display-value">
                        {state.purpose || "TimePass"}
                      </span>
                      {activeGame.isHost && state.status === "setup" && (
                        <button className="ghost compact-btn" onClick={() => {
                          setPurposeValue(state.purpose || "TimePass");
                          setEditingPurpose(true);
                        }}>
                          ✏️ Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(state.status === "setup" || state.status === "guess" || state.status === "secret") && (
                <div className="card">
                  <div className="split" style={{ marginBottom: "14px" }}>
                    <h2>👥 Squad Status</h2>
                    <span className="badge">{state.players.length}/8</span>
                  </div>
                  
                  {state.status === "setup" ? (
                    <div className="list">
                      {state.players.map((player, index) => (
                        <div className="list-item" key={player.id} style={{ borderColor: getPlayerColor(player.name, state.players) + "25" }}>
                          <span>
                            <strong style={{ marginRight: "6px", color: "rgba(255,255,255,0.3)" }}>{index + 1}.</strong>
                            <strong style={{ color: getPlayerColor(player.name, state.players) }}>{player.name}</strong>
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {player.id === activeGame.viewerPlayerId ? "You" : "Joined"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="player-status-grid">
                      {state.players.map((player) => {
                        const isCurrent = state.status === "guess" && activeTurnPlayer && player.id === activeTurnPlayer.id;
                        const isSelf = player.id === activeGame.viewerPlayerId;
                        const pColor = getPlayerColor(player.name, state.players);
                        return (
                          <div
                            className={`player-status-card ${isCurrent ? "current-turn" : ""} ${player.guessedBy ? "eliminated" : "alive"}`}
                            key={player.id}
                            style={{
                              borderColor: isCurrent ? "var(--color-primary)" : (player.guessedBy ? "rgba(255,255,255,0.05)" : pColor + "30"),
                              boxShadow: isCurrent ? `0 0 10px ${pColor}40` : "none"
                            }}
                          >
                            <div className="player-info">
                              <span style={{ fontWeight: 800, fontSize: "14px", color: pColor }}>
                                {player.name} {isSelf && <span className="self-tag">(You)</span>}
                              </span>
                              {player.guessedBy ? (
                                <span className="status-badge eliminated">
                                  ❌ Found by {player.guessedBy}
                                </span>
                              ) : (
                                <span className="status-badge alive">
                                  🛡️ Hiding
                                </span>
                              )}
                            </div>
                            
                            <div className="chat-avatar" style={{ 
                              borderColor: pColor,
                              boxShadow: `0 0 8px ${pColor}40`,
                              background: pColor + "15",
                              color: pColor
                            }}>
                              {player.name.substring(0, 2).toUpperCase()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="card chat-container">
                <div className="split" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
                  <h2>💬 Comm Link</h2>
                  <span className="badge">{messages.length}</span>
                </div>
                
                <div className="chat-list">
                  {messages.length === 0 && (
                    <p className="hero-copy" style={{ textAlign: "center", marginTop: "40px", fontSize: "14px" }}>
                      📡 Secure connection active. Say hello.
                    </p>
                  )}
                  {messages.map((message) => {
                    const isSelf = message.playerName === activeGame.viewerName;
                    const pColor = getPlayerColor(message.playerName, state.players);
                    return (
                      <div className={`chat-bubble-wrapper ${isSelf ? "self" : "other"}`} key={message.id}>
                        {!isSelf && (
                          <div className="chat-avatar" style={{ 
                            borderColor: pColor, 
                            color: pColor,
                            background: pColor + "15"
                          }}>
                            {message.playerName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="chat-bubble">
                          {!isSelf && (
                            <span className="chat-sender" style={{ color: pColor }}>
                              {message.playerName}
                            </span>
                          )}
                          <p className="chat-message-text">{message.messageText}</p>
                          <span className="chat-time">{formatMessageTime(message.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                
                <div className="row" style={{ marginTop: "10px" }}>
                  <input
                    value={chatMessage}
                    onChange={(event) => setChatMessage(event.target.value)}
                    maxLength={500}
                    placeholder="Broadcast message..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !busy) {
                        event.preventDefault();
                        void run(handleSendRoomMessage, "Message sent.");
                      }
                    }}
                  />
                  <button 
                    disabled={busy || !chatMessage.trim()} 
                    onClick={() => run(handleSendRoomMessage, "Message sent.")}
                    style={{ padding: "12px 18px" }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {feedback.error && <p className="message error">{feedback.error}</p>}
        {!feedback.error && (feedback.ok || latestLog()) && <p className="message ok">{feedback.ok || latestLog()}</p>}
      </section>
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
