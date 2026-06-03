import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { RANGES, getResults } from "@katrekat/game-core";
import { createGame, getGame, getProfile, joinGame, listGames, listRoomMessages, resetGame, sendRoomMessage, startGame, submitGuess, submitSecret, updateRange, updatePurpose } from "./api";
import { supabase } from "./supabase";
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
        return _jsx("main", { className: "page", children: _jsx("section", { className: "panel", children: _jsx("p", { className: "hero-copy", children: "Connecting to the room service..." }) }) });
    }
    return (_jsx("main", { className: "page", children: _jsxs("section", { className: "panel", children: [_jsxs("header", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "Online Multiplayer" }), _jsx("h1", { children: "Number Guess" })] }), !isSignedIn && _jsx("div", { className: "stack", children: _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Access" }), _jsx("h2", { children: authMode === "login" ? "Sign in" : "Create account" })] }), _jsx("button", { className: "ghost", onClick: () => setAuthMode(authMode === "login" ? "signup" : "login"), children: authMode === "login" ? "Need an account?" : "Already have an account?" })] }), _jsxs("div", { className: "stack compact", children: [authMode === "signup" && _jsx("input", { value: displayName, onChange: (event) => setDisplayName(event.target.value), placeholder: "Display name" }), _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), placeholder: "Email" }), _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password" }), _jsx("button", { disabled: busy, onClick: () => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created."), children: authMode === "login" ? "Sign in" : "Create account" })] })] }) }), isSignedIn && !activeGame && (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Lobby" }), _jsxs("h2", { children: ["Welcome, ", profile?.displayName] })] }), _jsx("button", { className: "ghost", onClick: () => run(handleLogout), children: "Sign out" })] }), _jsxs("div", { className: "actions", style: { marginTop: "16px" }, children: [_jsxs("div", { className: "purpose-selection-container", children: [_jsx("span", { className: "section-label", style: { display: "block", marginBottom: "8px" }, children: "Purpose to play:" }), _jsx("div", { className: "purpose-presets", children: [
                                                        { key: "Tea", label: "🍵 Tea" },
                                                        { key: "Breakfast", label: "🍳 Breakfast" },
                                                        { key: "Party", label: "🎉 Party" },
                                                        { key: "TimePass", label: "🎮 TimePass" },
                                                        { key: "Custom", label: "✍️ Custom Plan" }
                                                    ].map((item) => (_jsx("button", { type: "button", className: selectedPurpose === item.key ? "purpose-chip active" : "purpose-chip", onClick: () => setSelectedPurpose(item.key), children: item.label }, item.key))) }), selectedPurpose === "Custom" && (_jsx("input", { value: customPurpose, onChange: (e) => setCustomPurpose(e.target.value), placeholder: "Enter custom purpose...", className: "custom-purpose-input", maxLength: 50, style: { width: "100%", marginTop: "10px" } }))] }), _jsx("button", { disabled: busy, className: "primary", onClick: () => run(handleCreateGame, "Room created."), children: "Create room" }), _jsx("div", { className: "divider-line", children: _jsx("span", { children: "OR JOIN WITH CODE" }) }), _jsxs("div", { className: "row", children: [_jsx("input", { value: joinCode, onChange: (event) => setJoinCode(event.target.value.toUpperCase()), placeholder: "Room code" }), _jsx("button", { disabled: busy, onClick: () => run(handleJoinGame, "Joined room."), children: "Join room" })] })] })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Your rooms" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => session && run(() => refreshGames(session), "Rooms refreshed."), children: "Refresh" })] }), games.length === 0 && _jsx("p", { className: "hero-copy", children: "No rooms yet. Create one or join with a code." }), _jsx("div", { className: "list", children: games.map((game) => (_jsxs("button", { className: "list-item interactive", onClick: () => run(() => handleOpenGame(game.id)), children: [_jsx("span", { children: _jsx("strong", { children: game.roomCode }) }), _jsxs("span", { children: [game.playerCount, " players"] }), _jsx("span", { className: "badge", children: game.status }), _jsx("span", { children: game.isHost ? "👑 Host" : "Joined" })] }, game.id))) })] })] })), isSignedIn && activeGame && (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Room" }), _jsx("h2", { children: activeGame.roomCode })] }), _jsxs("div", { className: "actions-inline", children: [_jsx("button", { className: "ghost", onClick: () => run(handleShareRoomCode), children: "Share code" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => session && run(async () => { await refreshActiveGame(session, activeGame.id); await refreshMessages(session, activeGame.id, true); }, "Room refreshed."), children: "Refresh" }), _jsx("button", { className: "ghost", onClick: () => { setActiveGame(null); setMessages([]); }, children: "Back to lobby" })] })] }), _jsxs("p", { className: "hero-copy", children: ["Signed in as ", _jsx("strong", { children: activeGame.viewerName }), ". ", activeGame.isHost ? "You are the host." : "Waiting on the host for room setup."] }), _jsxs("p", { className: "hero-copy", children: ["Share this room code with friends: ", _jsx("strong", { children: activeGame.roomCode })] })] }), _jsxs("div", { className: "card room-purpose-card", children: [_jsx("span", { className: "section-label", children: "\uD83C\uDFAF Room Purpose" }), _jsx("div", { style: { marginTop: "6px" }, children: editingPurpose ? (_jsxs("div", { className: "row", style: { display: "flex", gap: "8px", alignItems: "center" }, children: [_jsx("input", { value: purposeValue, onChange: (e) => setPurposeValue(e.target.value), placeholder: "Enter room purpose...", maxLength: 50, style: { flex: 1 } }), _jsx("button", { className: "compact-btn", onClick: () => run(async () => {
                                                    await handleUpdatePurpose(purposeValue);
                                                    setEditingPurpose(false);
                                                }, "Purpose updated."), children: "Save" }), _jsx("button", { className: "compact-btn ghost", onClick: () => setEditingPurpose(false), children: "Cancel" })] })) : (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "12px" }, children: [_jsx("span", { className: "purpose-display-value", children: state.purpose || "TimePass" }), activeGame.isHost && state.status === "setup" && (_jsx("button", { className: "ghost compact-btn", onClick: () => {
                                                    setPurposeValue(state.purpose || "TimePass");
                                                    setEditingPurpose(true);
                                                }, children: "\u270F\uFE0F Edit" }))] })) })] }), state.status === "setup" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Choose range" }), _jsx("span", { className: "badge", children: state.range ? `1 - ${state.range}` : "Not chosen" })] }), _jsx("div", { className: "range-grid", children: RANGES.map((range) => (_jsxs("button", { disabled: !activeGame.isHost || busy, className: state.range === range ? "chip chip-active" : "chip", onClick: () => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`), children: ["1 - ", range] }, range))) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Players" }), _jsxs("span", { className: "badge", children: [state.players.length, "/8"] })] }), _jsx("div", { className: "list", children: state.players.map((player, index) => (_jsxs("div", { className: "list-item", children: [_jsxs("span", { children: [index + 1, ". ", player.name] }), _jsx("span", { children: player.id === activeGame.viewerPlayerId ? "You" : "Joined" })] }, player.id))) })] }), _jsx("button", { className: "primary", disabled: !activeGame.isHost || busy, onClick: () => run(handleStartGame, "Secret phase started."), children: "Start game" })] })), state.status === "secret" && activeSecretPlayer && (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Secret entry" }), _jsxs("p", { children: ["Player ", state.secIdx + 1, " of ", state.players.length, ": ", _jsx("strong", { children: activeSecretPlayer.name })] }), isViewerTurnForSecret ? (_jsxs("div", { className: "row", children: [_jsx("input", { type: "number", min: 1, max: state.range, value: secretValue, onChange: (event) => setSecretValue(event.target.value), placeholder: `1 to ${state.range}` }), _jsx("button", { disabled: busy, onClick: () => run(handleSubmitSecret, "Secret locked in."), children: "Lock in" })] })) : (_jsxs("p", { className: "hero-copy", children: ["Waiting for ", activeSecretPlayer.name, " to choose a secret number."] }))] })), state.status === "guess" && activeTurnPlayer && (() => {
                            const viewerPlayer = state.players.find((p) => p.id === activeGame.viewerPlayerId);
                            const viewerSecret = viewerPlayer?.secret;
                            const nextTurnIndex = (state.turn + 1) % state.players.length;
                            const nextPlayer = state.players[nextTurnIndex];
                            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: `card turn-dashboard ${isViewerTurnForGuess ? "turn-active-glow" : ""}`, children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("h2", { children: "Guess Phase" }), _jsxs("p", { className: "hero-copy", style: { margin: "4px 0 0" }, children: ["Range: 1 - ", state.range] })] }), _jsxs("div", { className: "turn-indicators", children: [_jsxs("div", { className: "turn-indicator-badge active-turn", children: [_jsx("span", { className: "dot pulse" }), "Active: ", _jsx("strong", { children: activeTurnPlayer.name }), " ", isViewerTurnForGuess && "(You)"] }), nextPlayer && (_jsxs("div", { className: "turn-indicator-badge next-turn", children: ["Next up: ", _jsx("strong", { children: nextPlayer.name })] }))] })] }), _jsx("p", { className: "turn-instructions", style: { marginTop: "12px", fontSize: "15px", color: isViewerTurnForGuess ? "#16606e" : "#5b6676" }, children: isViewerTurnForGuess ? "🎯 It's your turn! Pick a number from the board." : `⏳ Waiting for ${activeTurnPlayer.name} to make a guess.` })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Board" }), viewerSecret !== undefined && viewerSecret !== null && (_jsxs("span", { className: "badge secret-badge", children: ["\uD83D\uDD11 Your Secret: ", viewerSecret] }))] }), _jsx("div", { className: "board", style: { marginTop: "12px" }, children: state.board.map((cell) => {
                                                    const isOwnSecret = cell.n === viewerSecret;
                                                    return (_jsx("button", { disabled: cell.gone || !isViewerTurnForGuess || isOwnSecret || busy, className: cell.gone
                                                            ? "number number-gone"
                                                            : isOwnSecret
                                                                ? "number number-own-secret"
                                                                : "number", onClick: () => run(() => handleSubmitGuess(cell.n)), title: isOwnSecret ? "Your secret number (locked)" : undefined, children: cell.gone ? "" : isOwnSecret ? `🔒 ${cell.n}` : cell.n }, cell.n));
                                                }) })] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "Players" }), _jsx("div", { className: "player-status-grid", style: { display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: "12px" }, children: state.players.map((player) => {
                                                    const isCurrent = player.id === activeTurnPlayer.id;
                                                    const isSelf = player.id === activeGame.viewerPlayerId;
                                                    return (_jsx("div", { className: `player-status-card ${isCurrent ? "current-turn" : ""} ${player.guessedBy ? "eliminated" : "alive"}`, style: {
                                                            border: isCurrent ? "2px solid #16606e" : "1px solid #e0ddd4",
                                                            background: player.guessedBy ? "#f1f5f9" : isCurrent ? "#edf4f6" : "#ffffff",
                                                            borderRadius: "12px",
                                                            padding: "12px 14px",
                                                            position: "relative",
                                                            opacity: player.guessedBy ? 0.6 : 1
                                                        }, children: _jsxs("div", { className: "player-info", style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsxs("span", { style: { fontWeight: 600, fontSize: "15px", color: "#1e2430" }, children: [player.name, " ", isSelf && _jsx("span", { className: "self-tag", style: { color: "#16606e", fontSize: "12px", fontWeight: "normal" }, children: "(You)" })] }), player.guessedBy ? (_jsxs("span", { className: "status-badge eliminated", style: { color: "#a12f2f", fontSize: "13px", fontWeight: 600 }, children: ["\u274C Found by ", player.guessedBy] })) : (_jsx("span", { className: "status-badge alive", style: { color: "#12745a", fontSize: "13px", fontWeight: 600 }, children: "\uD83D\uDEE1\uFE0F Hiding" }))] }) }, player.id));
                                                }) })] })] }));
                        })(), state.status === "result" && _jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Results" }), _jsx("div", { className: "list", children: results.map((result) => _jsxs("div", { className: "result", children: [_jsx("strong", { children: result.playerName }), _jsx("span", { children: result.status.toUpperCase() }), _jsx("p", { children: result.subtitle })] }, result.playerId)) })] }), _jsx("button", { className: "primary", disabled: !activeGame.isHost || busy, onClick: () => run(handleResetGame, "Game reset for another round."), children: "Play again" })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Room chat" }), _jsxs("span", { className: "badge", children: [messages.length, " message", messages.length === 1 ? "" : "s"] })] }), _jsxs("div", { className: "chat-list", children: [messages.length === 0 && _jsx("p", { className: "hero-copy", children: "No messages yet. Say hello to the room." }), messages.map((message) => (_jsxs("div", { className: "chat-item", children: [_jsxs("div", { className: "chat-meta", children: [_jsx("strong", { children: message.playerName }), _jsx("span", { children: formatMessageTime(message.createdAt) })] }), _jsx("p", { children: message.messageText })] }, message.id)))] }), _jsxs("div", { className: "row", children: [_jsx("input", { value: chatMessage, onChange: (event) => setChatMessage(event.target.value), maxLength: 500, placeholder: "Type a room message", onKeyDown: (event) => {
                                                if (event.key === "Enter" && !busy) {
                                                    event.preventDefault();
                                                    void run(handleSendRoomMessage, "Message sent.");
                                                }
                                            } }), _jsx("button", { disabled: busy || !chatMessage.trim(), onClick: () => run(handleSendRoomMessage, "Message sent."), children: "Send" })] })] })] })), feedback.error && _jsx("p", { className: "message error", children: feedback.error }), !feedback.error && (feedback.ok || latestLog()) && _jsx("p", { className: "message ok", children: feedback.ok || latestLog() })] }) }));
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
