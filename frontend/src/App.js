import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState, useRef } from "react";
import { RANGES, getResults } from "@katrekat/game-core";
import { createGame, getGame, getProfile, joinGame, listGames, listRoomMessages, resetGame, sendRoomMessage, startGame, submitGuess, submitSecret, updateRange, updatePurpose } from "./api";
import { supabase } from "./supabase";
function getPlayerColor(playerName, players) {
    const index = players.findIndex(p => p.name.toLowerCase() === playerName.toLowerCase());
    const colors = [
        "#00e5ff", // Cyber Cyan
        "#ec4899", // Pink
        "#10b981", // Emerald
        "#f59e0b", // Amber
        "#a855f7", // Purple
        "#ef4444", // Red/Rose
        "#3b82f6", // Blue
        "#eab308" // Yellow
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
const emptyState = { status: "setup", range: 0, players: [], secIdx: 0, turn: 0, board: [], logs: [] };
export default function App() {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [games, setGames] = useState([]);
    const [activeGame, setActiveGame] = useState(null);
    const [authMode, setAuthMode] = useState("login");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [secretValue, setSecretValue] = useState("");
    const [chatMessage, setChatMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState({ error: "", ok: "Sign in to create or join a live room." });
    const [selectedPurpose, setSelectedPurpose] = useState("TimePass");
    const [customPurpose, setCustomPurpose] = useState("");
    const [editingPurpose, setEditingPurpose] = useState(false);
    const [purposeValue, setPurposeValue] = useState("");
    const chatEndRef = useRef(null);
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
            if (!alive)
                return;
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
        if (!session || !activeGame)
            return;
        const interval = window.setInterval(() => {
            void refreshActiveGame(session, activeGame.id, true);
            void refreshGames(session, true);
            void refreshMessages(session, activeGame.id, true);
        }, 3000);
        return () => window.clearInterval(interval);
    }, [session, activeGame?.id]);
    async function refreshProfile(currentSession, alive = true) {
        try {
            const nextProfile = await getProfile(currentSession);
            if (alive)
                setProfile(nextProfile);
        }
        catch (error) {
            setFeedback({ error: errorMessage(error), ok: "" });
        }
    }
    async function refreshGames(currentSession, alive = true) {
        try {
            const nextGames = await listGames(currentSession);
            if (alive)
                setGames(nextGames);
        }
        catch (error) {
            setFeedback({ error: errorMessage(error), ok: "" });
        }
    }
    async function refreshActiveGame(currentSession, gameId, silent = false) {
        try {
            setActiveGame(await getGame(currentSession, gameId));
        }
        catch (error) {
            if (!silent)
                setFeedback({ error: errorMessage(error), ok: "" });
        }
    }
    async function refreshMessages(currentSession, gameId, silent = false) {
        try {
            setMessages(await listRoomMessages(currentSession, gameId));
        }
        catch (error) {
            if (!silent)
                setFeedback({ error: errorMessage(error), ok: "" });
        }
    }
    async function run(task, successMessage = "") {
        try {
            setBusy(true);
            await task();
            if (successMessage)
                setFeedback({ error: "", ok: successMessage });
        }
        catch (error) {
            setFeedback({ error: errorMessage(error), ok: "" });
        }
        finally {
            setBusy(false);
        }
    }
    function latestLog(nextState) {
        const source = nextState ?? activeGame?.state ?? state;
        return source.logs[source.logs.length - 1]?.msg ?? "";
    }
    async function handleAuthSubmit() {
        if (authMode === "signup") {
            const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
            if (error)
                throw error;
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
        if (error || !data.session)
            throw error ?? new Error("Unable to sign in.");
        setSession(data.session);
        await refreshProfile(data.session);
        await refreshGames(data.session);
        setPassword("");
    }
    async function handleCreateGame() {
        if (!session)
            throw new Error("Please sign in first.");
        const finalPurpose = selectedPurpose === "Custom" ? (customPurpose.trim() || "Custom Plan") : selectedPurpose;
        const game = await createGame(session, finalPurpose);
        setActiveGame(game);
        await refreshMessages(session, game.id, true);
        await refreshGames(session);
    }
    async function handleUpdatePurpose(purpose) {
        if (!session || !activeGame)
            return;
        setActiveGame(await updatePurpose(session, activeGame.id, purpose));
        await refreshGames(session);
    }
    async function handleJoinGame() {
        if (!session)
            throw new Error("Please sign in first.");
        const game = await joinGame(session, joinCode);
        setActiveGame(game);
        setJoinCode("");
        await refreshMessages(session, game.id, true);
        await refreshGames(session);
    }
    async function handleOpenGame(gameId) {
        if (!session)
            throw new Error("Please sign in first.");
        await refreshActiveGame(session, gameId);
        await refreshMessages(session, gameId, true);
    }
    async function handleUpdateRange(range) {
        if (!session || !activeGame)
            return;
        setActiveGame(await updateRange(session, activeGame.id, range));
        await refreshGames(session);
    }
    async function handleStartGame() {
        if (!session || !activeGame)
            return;
        setActiveGame(await startGame(session, activeGame.id));
        await refreshGames(session);
    }
    async function handleSubmitSecret() {
        if (!session || !activeGame)
            return;
        setActiveGame(await submitSecret(session, activeGame.id, Number(secretValue)));
        setSecretValue("");
        await refreshGames(session);
    }
    async function handleSubmitGuess(number) {
        if (!session || !activeGame)
            return;
        const game = await submitGuess(session, activeGame.id, number);
        setActiveGame(game);
        await refreshGames(session);
        setFeedback({ error: "", ok: latestLog(game.state) });
    }
    async function handleResetGame() {
        if (!session || !activeGame)
            return;
        setActiveGame(await resetGame(session, activeGame.id));
        await refreshGames(session);
    }
    async function handleSendRoomMessage() {
        if (!session || !activeGame)
            return;
        await sendRoomMessage(session, activeGame.id, chatMessage);
        setChatMessage("");
        await refreshMessages(session, activeGame.id, true);
    }
    async function handleShareRoomCode() {
        if (!activeGame)
            return;
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
        return (_jsx("main", { className: "page", children: _jsx("section", { className: "panel", style: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }, children: [_jsx("span", { className: "dot pulse", style: { width: "16px", height: "16px" } }), _jsx("p", { className: "hero-copy", style: { margin: 0, fontWeight: 600 }, children: "Syncing room service link..." })] }) }) }));
    }
    return (_jsx("main", { className: "page", children: _jsxs("section", { className: "panel", children: [_jsxs("header", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "Online Multiplayer Arena" }), _jsx("h1", { children: "Number Guess" })] }), !isSignedIn && (_jsx("div", { className: "stack", children: _jsxs("div", { className: "card", style: { maxWidth: "480px", margin: "0 auto", width: "100%" }, children: [_jsxs("div", { className: "auth-title-container", children: [_jsx("p", { className: "section-label", children: "Security Portal" }), _jsx("h2", { style: { fontSize: "24px", margin: "6px 0" }, children: authMode === "login" ? "Welcome Back" : "Initiate Account" })] }), _jsxs("div", { className: "stack compact", style: { marginTop: "20px" }, children: [authMode === "signup" && (_jsx("input", { value: displayName, onChange: (event) => setDisplayName(event.target.value), placeholder: "Gamer handle / Display name" })), _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), placeholder: "Email Address", type: "email" }), _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password", onKeyDown: (event) => {
                                            if (event.key === "Enter" && !busy) {
                                                void run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created.");
                                            }
                                        } }), _jsx("button", { disabled: busy, style: { marginTop: "10px" }, onClick: () => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created."), children: authMode === "login" ? "Enter Arena" : "Register Handle" }), _jsxs("div", { style: { textAlign: "center", marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }, children: [authMode === "login" ? "New recruit? " : "Already registered? ", _jsx("button", { className: "auth-swap-button", onClick: () => setAuthMode(authMode === "login" ? "signup" : "login"), children: authMode === "login" ? "Create an account" : "Sign in here" })] })] })] }) })), isSignedIn && !activeGame && (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Lobby Control" }), _jsxs("h2", { children: ["Welcome, ", profile?.displayName] })] }), _jsx("button", { className: "ghost", onClick: () => run(handleLogout), children: "Sign out" })] }), _jsxs("div", { className: "actions", style: { marginTop: "20px" }, children: [_jsxs("div", { className: "purpose-selection-container", children: [_jsx("span", { className: "section-label", style: { display: "block", marginBottom: "8px" }, children: "Purpose to play:" }), _jsx("div", { className: "purpose-presets", children: [
                                                        { key: "Tea", label: "🍵 Tea" },
                                                        { key: "Breakfast", label: "🍳 Breakfast" },
                                                        { key: "Party", label: "🎉 Party" },
                                                        { key: "TimePass", label: "🎮 TimePass" },
                                                        { key: "Custom", label: "✍️ Custom Plan" }
                                                    ].map((item) => (_jsx("button", { type: "button", className: selectedPurpose === item.key ? "purpose-chip active" : "purpose-chip", onClick: () => setSelectedPurpose(item.key), children: item.label }, item.key))) }), selectedPurpose === "Custom" && (_jsx("input", { value: customPurpose, onChange: (e) => setCustomPurpose(e.target.value), placeholder: "Enter custom purpose...", className: "custom-purpose-input", maxLength: 50, style: { width: "100%", marginTop: "10px" } }))] }), _jsx("button", { disabled: busy, className: "primary", onClick: () => run(handleCreateGame, "Room created."), children: "Create room" }), _jsx("div", { className: "divider-line", children: _jsx("span", { children: "OR JOIN WITH CODE" }) }), _jsxs("div", { className: "row", children: [_jsx("input", { value: joinCode, onChange: (event) => setJoinCode(event.target.value.toUpperCase()), placeholder: "Room code", onKeyDown: (e) => {
                                                        if (e.key === "Enter" && !busy) {
                                                            void run(handleJoinGame, "Joined room.");
                                                        }
                                                    } }), _jsx("button", { disabled: busy, onClick: () => run(handleJoinGame, "Joined room."), children: "Join room" })] })] })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Your Rooms" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => session && run(() => refreshGames(session), "Rooms refreshed."), children: "Refresh" })] }), games.length === 0 && _jsx("p", { className: "hero-copy", style: { textAlign: "center", margin: "24px 0" }, children: "No rooms yet. Create one or join with a code." }), _jsx("div", { className: "list", children: games.map((game) => (_jsxs("button", { className: "list-item interactive", onClick: () => run(() => handleOpenGame(game.id)), children: [_jsx("span", { children: _jsx("strong", { children: game.roomCode }) }), _jsxs("span", { children: [game.playerCount, " players"] }), _jsx("span", { className: `badge status-${game.status}`, children: game.status }), _jsx("span", { children: game.isHost ? "👑 Host" : "Joined" })] }, game.id))) })] })] })), isSignedIn && activeGame && (_jsxs("div", { className: "active-room-layout", children: [_jsxs("div", { className: "stack", children: [state.status === "setup" && (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", style: { marginBottom: "12px" }, children: [_jsx("h2", { children: "\u2699\uFE0F Choose Number Range" }), _jsx("span", { className: "badge status-setup", children: state.range ? `1 - ${state.range}` : "Not chosen" })] }), _jsx("p", { className: "hero-copy", style: { marginBottom: "20px" }, children: "Select the range limit. Players will submit their secrets and play guessing sweeps in this scope." }), _jsx("div", { className: "range-grid", children: RANGES.map((range) => (_jsxs("button", { disabled: !activeGame.isHost || busy, className: state.range === range ? "chip chip-active" : "chip", onClick: () => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`), children: ["1 - ", range] }, range))) }), activeGame.isHost && (_jsx("button", { className: "primary", style: { marginTop: "24px" }, disabled: !state.range || state.players.length < 2 || busy, onClick: () => run(handleStartGame, "Secret phase started."), children: "\uD83D\uDE80 Start game" }))] })), state.status === "secret" && activeSecretPlayer && (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\uD83D\uDD11 Secret Entry Phase" }), _jsxs("p", { style: { fontSize: "16px", margin: "8px 0 16px" }, children: ["Player ", state.secIdx + 1, " of ", state.players.length, ":", " ", _jsx("strong", { style: { color: getPlayerColor(activeSecretPlayer.name, state.players), textShadow: `0 0 8px ${getPlayerColor(activeSecretPlayer.name, state.players)}40` }, children: activeSecretPlayer.name })] }), isViewerTurnForSecret ? (_jsxs("div", { className: "stack compact", children: [_jsxs("p", { className: "hero-copy", style: { margin: 0 }, children: ["Enter your secret number between ", _jsx("strong", { children: "1" }), " and ", _jsx("strong", { children: state.range }), ". Keep it hidden!"] }), _jsxs("div", { className: "row", children: [_jsx("input", { type: "number", min: 1, max: state.range, value: secretValue, onChange: (event) => setSecretValue(event.target.value), placeholder: `1 to ${state.range}`, onKeyDown: (e) => {
                                                                if (e.key === "Enter" && !busy) {
                                                                    void run(handleSubmitSecret, "Secret locked in.");
                                                                }
                                                            } }), _jsx("button", { disabled: busy || !secretValue, onClick: () => run(handleSubmitSecret, "Secret locked in."), children: "Lock Secret" })] })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "12px", background: "rgba(0, 0, 0, 0.15)", padding: "16px", borderRadius: "12px" }, children: [_jsx("span", { className: "dot pulse", style: { backgroundColor: getPlayerColor(activeSecretPlayer.name, state.players) } }), _jsxs("p", { className: "hero-copy", style: { margin: 0 }, children: ["Waiting for ", _jsx("strong", { children: activeSecretPlayer.name }), " to enter their secret number..."] })] }))] })), state.status === "guess" && activeTurnPlayer && (() => {
                                    const viewerPlayer = state.players.find((p) => p.id === activeGame.viewerPlayerId);
                                    const viewerSecret = viewerPlayer?.secret;
                                    const nextTurnIndex = (state.turn + 1) % state.players.length;
                                    const nextPlayer = state.players[nextTurnIndex];
                                    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: `card turn-dashboard ${isViewerTurnForGuess ? "turn-active-glow" : ""}`, children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("h2", { children: "\uD83C\uDFAF Guess Phase" }), _jsxs("p", { className: "hero-copy", style: { margin: "4px 0 0" }, children: ["Range: ", _jsxs("strong", { children: ["1 - ", state.range] })] })] }), _jsxs("div", { className: "turn-indicators", children: [_jsxs("div", { className: "turn-indicator-badge active-turn", children: [_jsx("span", { className: "dot pulse", style: { backgroundColor: getPlayerColor(activeTurnPlayer.name, state.players) } }), "Active: ", _jsx("strong", { style: { color: getPlayerColor(activeTurnPlayer.name, state.players), marginLeft: "4px" }, children: activeTurnPlayer.name }), " ", isViewerTurnForGuess && "(You)"] }), nextPlayer && (_jsxs("div", { className: "turn-indicator-badge next-turn", children: ["Next: ", _jsx("strong", { style: { color: getPlayerColor(nextPlayer.name, state.players), marginLeft: "4px" }, children: nextPlayer.name })] }))] })] }), _jsx("p", { className: "turn-instructions", style: { marginTop: "16px", color: isViewerTurnForGuess ? "var(--color-cyan)" : "var(--text-muted)" }, children: isViewerTurnForGuess ? (_jsxs("span", { children: ["\uD83C\uDFAF ", _jsx("strong", { children: "It's your turn!" }), " Choose an available number from the grid below."] })) : (_jsxs("span", { children: ["\u23F3 Waiting for ", _jsx("strong", { children: activeTurnPlayer.name }), " to make a guess."] })) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", style: { marginBottom: "16px" }, children: [_jsx("h2", { children: "Radar Grid" }), viewerSecret !== undefined && viewerSecret !== null && (_jsxs("span", { className: "badge secret-badge", children: ["\uD83D\uDD11 Your Secret: ", viewerSecret] }))] }), _jsx("div", { className: "board", children: state.board.map((cell) => {
                                                            const isOwnSecret = cell.n === viewerSecret;
                                                            return (_jsx("button", { disabled: cell.gone || !isViewerTurnForGuess || isOwnSecret || busy, className: cell.gone
                                                                    ? "number number-gone"
                                                                    : isOwnSecret
                                                                        ? "number number-own-secret"
                                                                        : "number", onClick: () => run(() => handleSubmitGuess(cell.n)), title: isOwnSecret ? "Your secret number (locked)" : undefined, children: cell.gone ? "" : isOwnSecret ? `🔒 ${cell.n}` : cell.n }, cell.n));
                                                        }) })] })] }));
                                })(), state.status === "result" && (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\uD83C\uDFC6 Battle Results" }), _jsx("div", { className: "list", style: { margin: "16px 0" }, children: results.map((result) => {
                                                const isWinner = result.status === "winner";
                                                return (_jsxs("div", { className: `result ${isWinner ? "winner-border" : "loser-border"}`, children: [_jsxs("div", { className: "split", children: [_jsx("span", { style: {
                                                                        fontWeight: 800,
                                                                        fontSize: "16px",
                                                                        color: getPlayerColor(result.playerName, state.players),
                                                                        textShadow: `0 0 8px ${getPlayerColor(result.playerName, state.players)}30`
                                                                    }, children: result.playerName }), _jsx("span", { className: `result-status ${result.status}`, children: isWinner ? "🥇 Winner" : "💀 Eliminated" })] }), _jsx("p", { className: "hero-copy", style: { margin: "6px 0 0", fontSize: "14px" }, children: result.subtitle })] }, result.playerId));
                                            }) }), activeGame.isHost && (_jsx("button", { className: "primary", disabled: busy, onClick: () => run(handleResetGame, "Game reset for another round."), children: "Play again" }))] }))] }), _jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "split", style: { marginBottom: "12px" }, children: _jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Room ID" }), _jsx("h2", { style: { fontSize: "24px", margin: 0, color: "var(--color-cyan)" }, children: activeGame.roomCode })] }) }), _jsxs("div", { className: "stack compact", style: { fontSize: "14px", color: "var(--text-muted)" }, children: [_jsxs("p", { style: { margin: 0 }, children: ["Signed in as", " ", _jsx("strong", { style: { color: getPlayerColor(activeGame.viewerName, state.players), textShadow: `0 0 6px ${getPlayerColor(activeGame.viewerName, state.players)}30` }, children: activeGame.viewerName })] }), _jsx("p", { style: { margin: 0 }, children: activeGame.isHost ? "👑 Room Host (You)" : "🎮 Joined" })] }), _jsxs("div", { className: "actions-inline", style: { marginTop: "18px" }, children: [_jsx("button", { className: "ghost compact-btn", onClick: () => run(handleShareRoomCode), children: "Copy Code" }), _jsx("button", { className: "ghost compact-btn", disabled: busy, onClick: () => session && run(async () => { await refreshActiveGame(session, activeGame.id); await refreshMessages(session, activeGame.id, true); }, "Room refreshed."), children: "Refresh" }), _jsx("button", { className: "ghost compact-btn", onClick: () => { setActiveGame(null); setMessages([]); }, children: "Lobby" })] })] }), _jsxs("div", { className: "card room-purpose-card", children: [_jsx("span", { className: "section-label", children: "\uD83C\uDFAF Room Purpose" }), _jsx("div", { style: { marginTop: "8px" }, children: editingPurpose ? (_jsxs("div", { className: "stack compact", children: [_jsx("input", { value: purposeValue, onChange: (e) => setPurposeValue(e.target.value), placeholder: "Enter room purpose...", maxLength: 50 }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "compact-btn", onClick: () => run(async () => {
                                                                    await handleUpdatePurpose(purposeValue);
                                                                    setEditingPurpose(false);
                                                                }, "Purpose updated."), children: "Save" }), _jsx("button", { className: "compact-btn ghost", onClick: () => setEditingPurpose(false), children: "Cancel" })] })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }, children: [_jsx("span", { className: "purpose-display-value", children: state.purpose || "TimePass" }), activeGame.isHost && state.status === "setup" && (_jsx("button", { className: "ghost compact-btn", onClick: () => {
                                                            setPurposeValue(state.purpose || "TimePass");
                                                            setEditingPurpose(true);
                                                        }, children: "\u270F\uFE0F Edit" }))] })) })] }), (state.status === "setup" || state.status === "guess" || state.status === "secret") && (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", style: { marginBottom: "14px" }, children: [_jsx("h2", { children: "\uD83D\uDC65 Squad Status" }), _jsxs("span", { className: "badge", children: [state.players.length, "/8"] })] }), state.status === "setup" ? (_jsx("div", { className: "list", children: state.players.map((player, index) => (_jsxs("div", { className: "list-item", style: { borderColor: getPlayerColor(player.name, state.players) + "25" }, children: [_jsxs("span", { children: [_jsxs("strong", { style: { marginRight: "6px", color: "rgba(255,255,255,0.3)" }, children: [index + 1, "."] }), _jsx("strong", { style: { color: getPlayerColor(player.name, state.players) }, children: player.name })] }), _jsx("span", { style: { fontSize: "12px", color: "var(--text-muted)" }, children: player.id === activeGame.viewerPlayerId ? "You" : "Joined" })] }, player.id))) })) : (_jsx("div", { className: "player-status-grid", children: state.players.map((player) => {
                                                const isCurrent = state.status === "guess" && activeTurnPlayer && player.id === activeTurnPlayer.id;
                                                const isSelf = player.id === activeGame.viewerPlayerId;
                                                const pColor = getPlayerColor(player.name, state.players);
                                                return (_jsxs("div", { className: `player-status-card ${isCurrent ? "current-turn" : ""} ${player.guessedBy ? "eliminated" : "alive"}`, style: {
                                                        borderColor: isCurrent ? "var(--color-primary)" : (player.guessedBy ? "rgba(255,255,255,0.05)" : pColor + "30"),
                                                        boxShadow: isCurrent ? `0 0 10px ${pColor}40` : "none"
                                                    }, children: [_jsxs("div", { className: "player-info", children: [_jsxs("span", { style: { fontWeight: 800, fontSize: "14px", color: pColor }, children: [player.name, " ", isSelf && _jsx("span", { className: "self-tag", children: "(You)" })] }), player.guessedBy ? (_jsxs("span", { className: "status-badge eliminated", children: ["\u274C Found by ", player.guessedBy] })) : (_jsx("span", { className: "status-badge alive", children: "\uD83D\uDEE1\uFE0F Hiding" }))] }), _jsx("div", { className: "chat-avatar", style: {
                                                                borderColor: pColor,
                                                                boxShadow: `0 0 8px ${pColor}40`,
                                                                background: pColor + "15",
                                                                color: pColor
                                                            }, children: player.name.substring(0, 2).toUpperCase() })] }, player.id));
                                            }) }))] })), _jsxs("div", { className: "card chat-container", children: [_jsxs("div", { className: "split", style: { borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }, children: [_jsx("h2", { children: "\uD83D\uDCAC Comm Link" }), _jsx("span", { className: "badge", children: messages.length })] }), _jsxs("div", { className: "chat-list", children: [messages.length === 0 && (_jsx("p", { className: "hero-copy", style: { textAlign: "center", marginTop: "40px", fontSize: "14px" }, children: "\uD83D\uDCE1 Secure connection active. Say hello." })), messages.map((message) => {
                                                    const isSelf = message.playerName === activeGame.viewerName;
                                                    const pColor = getPlayerColor(message.playerName, state.players);
                                                    return (_jsxs("div", { className: `chat-bubble-wrapper ${isSelf ? "self" : "other"}`, children: [!isSelf && (_jsx("div", { className: "chat-avatar", style: {
                                                                    borderColor: pColor,
                                                                    color: pColor,
                                                                    background: pColor + "15"
                                                                }, children: message.playerName.substring(0, 2).toUpperCase() })), _jsxs("div", { className: "chat-bubble", children: [!isSelf && (_jsx("span", { className: "chat-sender", style: { color: pColor }, children: message.playerName })), _jsx("p", { className: "chat-message-text", children: message.messageText }), _jsx("span", { className: "chat-time", children: formatMessageTime(message.createdAt) })] })] }, message.id));
                                                }), _jsx("div", { ref: chatEndRef })] }), _jsxs("div", { className: "row", style: { marginTop: "10px" }, children: [_jsx("input", { value: chatMessage, onChange: (event) => setChatMessage(event.target.value), maxLength: 500, placeholder: "Broadcast message...", onKeyDown: (event) => {
                                                        if (event.key === "Enter" && !busy) {
                                                            event.preventDefault();
                                                            void run(handleSendRoomMessage, "Message sent.");
                                                        }
                                                    } }), _jsx("button", { disabled: busy || !chatMessage.trim(), onClick: () => run(handleSendRoomMessage, "Message sent."), style: { padding: "12px 18px" }, children: "Send" })] })] })] })] })), feedback.error && _jsx("p", { className: "message error", children: feedback.error }), !feedback.error && (feedback.ok || latestLog()) && _jsx("p", { className: "message ok", children: feedback.ok || latestLog() })] }) }));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : "Unexpected error.";
}
function formatMessageTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}
