import { useEffect, useMemo, useState } from "react";
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
    return <main className="page"><section className="panel"><p className="hero-copy">Connecting to the room service...</p></section></main>;
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="hero">
          <p className="eyebrow">Online Multiplayer</p>
          <h1>Number Guess</h1>
        </header>

        {!isSignedIn && <div className="stack"><div className="card"><div className="split"><div><p className="section-label">Access</p><h2>{authMode === "login" ? "Sign in" : "Create account"}</h2></div><button className="ghost" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Need an account?" : "Already have an account?"}</button></div><div className="stack compact">{authMode === "signup" && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />}<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" /><button disabled={busy} onClick={() => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created.")}>{authMode === "login" ? "Sign in" : "Create account"}</button></div></div></div>}

        {isSignedIn && !activeGame && (
          <div className="stack">
            <div className="card">
              <div className="split">
                <div>
                  <p className="section-label">Lobby</p>
                  <h2>Welcome, {profile?.displayName}</h2>
                </div>
                <button className="ghost" onClick={() => run(handleLogout)}>Sign out</button>
              </div>

              <div className="actions" style={{ marginTop: "16px" }}>
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
                  />
                  <button disabled={busy} onClick={() => run(handleJoinGame, "Joined room.")}>
                    Join room
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="split">
                <h2>Your rooms</h2>
                <button className="ghost" disabled={busy} onClick={() => session && run(() => refreshGames(session), "Rooms refreshed.")}>
                  Refresh
                </button>
              </div>
              {games.length === 0 && <p className="hero-copy">No rooms yet. Create one or join with a code.</p>}
              <div className="list">
                {games.map((game) => (
                  <button className="list-item interactive" key={game.id} onClick={() => run(() => handleOpenGame(game.id))}>
                    <span><strong>{game.roomCode}</strong></span>
                    <span>{game.playerCount} players</span>
                    <span className="badge">{game.status}</span>
                    <span>{game.isHost ? "👑 Host" : "Joined"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isSignedIn && activeGame && (
          <div className="stack">
            <div className="card">
              <div className="split">
                <div>
                  <p className="section-label">Room</p>
                  <h2>{activeGame.roomCode}</h2>
                </div>
                <div className="actions-inline">
                  <button className="ghost" onClick={() => run(handleShareRoomCode)}>Share code</button>
                  <button className="ghost" disabled={busy} onClick={() => session && run(async () => { await refreshActiveGame(session, activeGame.id); await refreshMessages(session, activeGame.id, true); }, "Room refreshed.")}>Refresh</button>
                  <button className="ghost" onClick={() => { setActiveGame(null); setMessages([]); }}>Back to lobby</button>
                </div>
              </div>
              <p className="hero-copy">Signed in as <strong>{activeGame.viewerName}</strong>. {activeGame.isHost ? "You are the host." : "Waiting on the host for room setup."}</p>
              <p className="hero-copy">Share this room code with friends: <strong>{activeGame.roomCode}</strong></p>
            </div>

            <div className="card room-purpose-card">
              <span className="section-label">🎯 Room Purpose</span>
              <div style={{ marginTop: "6px" }}>
                {editingPurpose ? (
                  <div className="row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      value={purposeValue}
                      onChange={(e) => setPurposeValue(e.target.value)}
                      placeholder="Enter room purpose..."
                      maxLength={50}
                      style={{ flex: 1 }}
                    />
                    <button className="compact-btn" onClick={() => run(async () => {
                      await handleUpdatePurpose(purposeValue);
                      setEditingPurpose(false);
                    }, "Purpose updated.")}>Save</button>
                    <button className="compact-btn ghost" onClick={() => setEditingPurpose(false)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

            {state.status === "setup" && (
              <>
                <div className="card">
                  <div className="split">
                    <h2>Choose range</h2>
                    <span className="badge">{state.range ? `1 - ${state.range}` : "Not chosen"}</span>
                  </div>
                  <div className="range-grid">
                    {RANGES.map((range) => (
                      <button key={range} disabled={!activeGame.isHost || busy} className={state.range === range ? "chip chip-active" : "chip"} onClick={() => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`)}>1 - {range}</button>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="split">
                    <h2>Players</h2>
                    <span className="badge">{state.players.length}/8</span>
                  </div>
                  <div className="list">
                    {state.players.map((player, index) => (
                      <div className="list-item" key={player.id}>
                        <span>{index + 1}. {player.name}</span>
                        <span>{player.id === activeGame.viewerPlayerId ? "You" : "Joined"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="primary" disabled={!activeGame.isHost || busy} onClick={() => run(handleStartGame, "Secret phase started.")}>
                  Start game
                </button>
              </>
            )}

            {state.status === "secret" && activeSecretPlayer && (
              <div className="card">
                <h2>Secret entry</h2>
                <p>Player {state.secIdx + 1} of {state.players.length}: <strong>{activeSecretPlayer.name}</strong></p>
                {isViewerTurnForSecret ? (
                  <div className="row">
                    <input type="number" min={1} max={state.range} value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder={`1 to ${state.range}`} />
                    <button disabled={busy} onClick={() => run(handleSubmitSecret, "Secret locked in.")}>Lock in</button>
                  </div>
                ) : (
                  <p className="hero-copy">Waiting for {activeSecretPlayer.name} to choose a secret number.</p>
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
                        <h2>Guess Phase</h2>
                        <p className="hero-copy" style={{ margin: "4px 0 0" }}>
                          Range: 1 - {state.range}
                        </p>
                      </div>
                      <div className="turn-indicators">
                        <div className="turn-indicator-badge active-turn">
                          <span className="dot pulse"></span>
                          Active: <strong>{activeTurnPlayer.name}</strong> {isViewerTurnForGuess && "(You)"}
                        </div>
                        {nextPlayer && (
                          <div className="turn-indicator-badge next-turn">
                            Next up: <strong>{nextPlayer.name}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="turn-instructions" style={{ marginTop: "12px", fontSize: "15px", color: isViewerTurnForGuess ? "#16606e" : "#5b6676" }}>
                      {isViewerTurnForGuess ? "🎯 It's your turn! Pick a number from the board." : `⏳ Waiting for ${activeTurnPlayer.name} to make a guess.`}
                    </p>
                  </div>

                  <div className="card">
                    <div className="split">
                      <h2>Board</h2>
                      {viewerSecret !== undefined && viewerSecret !== null && (
                        <span className="badge secret-badge">🔑 Your Secret: {viewerSecret}</span>
                      )}
                    </div>
                    <div className="board" style={{ marginTop: "12px" }}>
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

                  <div className="card">
                    <h2>Players</h2>
                    <div className="player-status-grid" style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: "12px" }}>
                      {state.players.map((player) => {
                        const isCurrent = player.id === activeTurnPlayer.id;
                        const isSelf = player.id === activeGame.viewerPlayerId;
                        return (
                          <div
                            className={`player-status-card ${isCurrent ? "current-turn" : ""} ${player.guessedBy ? "eliminated" : "alive"}`}
                            key={player.id}
                            style={{
                              border: isCurrent ? "2px solid #16606e" : "1px solid #e0ddd4",
                              background: player.guessedBy ? "#f1f5f9" : isCurrent ? "#edf4f6" : "#ffffff",
                              borderRadius: "12px",
                              padding: "12px 14px",
                              position: "relative",
                              opacity: player.guessedBy ? 0.6 : 1
                            }}
                          >
                            <div className="player-info" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontWeight: 600, fontSize: "15px", color: "#1e2430" }}>
                                {player.name} {isSelf && <span className="self-tag" style={{ color: "#16606e", fontSize: "12px", fontWeight: "normal" }}>(You)</span>}
                              </span>
                              {player.guessedBy ? (
                                <span className="status-badge eliminated" style={{ color: "#a12f2f", fontSize: "13px", fontWeight: 600 }}>
                                  ❌ Found by {player.guessedBy}
                                </span>
                              ) : (
                                <span className="status-badge alive" style={{ color: "#12745a", fontSize: "13px", fontWeight: 600 }}>
                                  🛡️ Hiding
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

          {state.status === "result" && <><div className="card"><h2>Results</h2><div className="list">{results.map((result) => <div className="result" key={result.playerId}><strong>{result.playerName}</strong><span>{result.status.toUpperCase()}</span><p>{result.subtitle}</p></div>)}</div></div><button className="primary" disabled={!activeGame.isHost || busy} onClick={() => run(handleResetGame, "Game reset for another round.")}>Play again</button></>}

          <div className="card">
            <div className="split">
              <h2>Room chat</h2>
              <span className="badge">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
            </div>
            <div className="chat-list">
              {messages.length === 0 && <p className="hero-copy">No messages yet. Say hello to the room.</p>}
              {messages.map((message) => (
                <div className="chat-item" key={message.id}>
                  <div className="chat-meta">
                    <strong>{message.playerName}</strong>
                    <span>{formatMessageTime(message.createdAt)}</span>
                  </div>
                  <p>{message.messageText}</p>
                </div>
              ))}
            </div>
            <div className="row">
              <input
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                maxLength={500}
                placeholder="Type a room message"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !busy) {
                    event.preventDefault();
                    void run(handleSendRoomMessage, "Message sent.");
                  }
                }}
              />
              <button disabled={busy || !chatMessage.trim()} onClick={() => run(handleSendRoomMessage, "Message sent.")}>
                Send
              </button>
            </div>
          </div>
        </div>)}

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
