import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { RANGES, getResults } from "@katrekat/game-core";
import { createGame, getGame, getProfile, joinGame, listGames, resetGame, startGame, submitGuess, submitSecret, updateRange } from "./api";
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
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState({ error: "", ok: "Sign in to create or join a live room." });
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
        setActiveGame(await createGame(session));
        await refreshGames(session);
    }
    async function handleJoinGame() {
        if (!session)
            throw new Error("Please sign in first.");
        setActiveGame(await joinGame(session, joinCode));
        setJoinCode("");
        await refreshGames(session);
    }
    async function handleOpenGame(gameId) {
        if (!session)
            throw new Error("Please sign in first.");
        await refreshActiveGame(session, gameId);
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
    async function handleLogout() {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setGames([]);
        setActiveGame(null);
        setFeedback({ error: "", ok: "Signed out." });
    }
    if (loading) {
        return _jsx("main", { className: "page", children: _jsx("section", { className: "panel", children: _jsx("p", { className: "hero-copy", children: "Connecting to the room service..." }) }) });
    }
    return (_jsx("main", { className: "page", children: _jsxs("section", { className: "panel", children: [_jsxs("header", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "Online Multiplayer" }), _jsx("h1", { children: "Number Guess" }), _jsx("p", { className: "hero-copy", children: "Live rooms with simple Supabase login, ready for Netlify and Render." })] }), !isSignedIn && _jsx("div", { className: "stack", children: _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Access" }), _jsx("h2", { children: authMode === "login" ? "Sign in" : "Create account" })] }), _jsx("button", { className: "ghost", onClick: () => setAuthMode(authMode === "login" ? "signup" : "login"), children: authMode === "login" ? "Need an account?" : "Already have an account?" })] }), _jsxs("div", { className: "stack compact", children: [authMode === "signup" && _jsx("input", { value: displayName, onChange: (event) => setDisplayName(event.target.value), placeholder: "Display name" }), _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), placeholder: "Email" }), _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password" }), _jsx("button", { disabled: busy, onClick: () => run(handleAuthSubmit, authMode === "login" ? "Signed in." : "Account created."), children: authMode === "login" ? "Sign in" : "Create account" })] })] }) }), isSignedIn && !activeGame && _jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Lobby" }), _jsxs("h2", { children: ["Welcome, ", profile?.displayName] })] }), _jsx("button", { className: "ghost", onClick: () => run(handleLogout), children: "Sign out" })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { disabled: busy, onClick: () => run(handleCreateGame, "Room created."), children: "Create room" }), _jsxs("div", { className: "row", children: [_jsx("input", { value: joinCode, onChange: (event) => setJoinCode(event.target.value.toUpperCase()), placeholder: "Room code" }), _jsx("button", { disabled: busy, onClick: () => run(handleJoinGame, "Joined room."), children: "Join room" })] })] })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Your rooms" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => session && run(() => refreshGames(session), "Rooms refreshed."), children: "Refresh" })] }), games.length === 0 && _jsx("p", { className: "hero-copy", children: "No rooms yet. Create one or join with a code." }), _jsx("div", { className: "list", children: games.map((game) => _jsxs("button", { className: "list-item interactive", onClick: () => run(() => handleOpenGame(game.id)), children: [_jsx("span", { children: _jsx("strong", { children: game.roomCode }) }), _jsxs("span", { children: [game.playerCount, " players"] }), _jsx("span", { children: game.status }), _jsx("span", { children: game.isHost ? "Host" : "Joined" })] }, game.id)) })] })] }), isSignedIn && activeGame && _jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsxs("div", { children: [_jsx("p", { className: "section-label", children: "Room" }), _jsx("h2", { children: activeGame.roomCode })] }), _jsxs("div", { className: "actions-inline", children: [_jsx("button", { className: "ghost", disabled: busy, onClick: () => session && run(() => refreshActiveGame(session, activeGame.id), "Room refreshed."), children: "Refresh" }), _jsx("button", { className: "ghost", onClick: () => setActiveGame(null), children: "Back to lobby" })] })] }), _jsxs("p", { className: "hero-copy", children: ["Signed in as ", _jsx("strong", { children: activeGame.viewerName }), ". ", activeGame.isHost ? "You are the host." : "Waiting on the host for room setup."] })] }), state.status === "setup" && _jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Choose range" }), _jsx("span", { className: "badge", children: state.range ? `1 - ${state.range}` : "Not chosen" })] }), _jsx("div", { className: "range-grid", children: RANGES.map((range) => _jsxs("button", { disabled: !activeGame.isHost || busy, className: state.range === range ? "chip chip-active" : "chip", onClick: () => run(() => handleUpdateRange(range), `Range set to 1 - ${range}.`), children: ["1 - ", range] }, range)) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "split", children: [_jsx("h2", { children: "Players" }), _jsxs("span", { className: "badge", children: [state.players.length, "/8"] })] }), _jsx("div", { className: "list", children: state.players.map((player, index) => _jsxs("div", { className: "list-item", children: [_jsxs("span", { children: [index + 1, ". ", player.name] }), _jsx("span", { children: player.id === activeGame.viewerPlayerId ? "You" : "Joined" })] }, player.id)) })] }), _jsx("button", { className: "primary", disabled: !activeGame.isHost || busy, onClick: () => run(handleStartGame, "Secret phase started."), children: "Start game" })] }), state.status === "secret" && activeSecretPlayer && _jsxs("div", { className: "card", children: [_jsx("h2", { children: "Secret entry" }), _jsxs("p", { children: ["Player ", state.secIdx + 1, " of ", state.players.length, ": ", _jsx("strong", { children: activeSecretPlayer.name })] }), isViewerTurnForSecret ? _jsxs("div", { className: "row", children: [_jsx("input", { type: "number", min: 1, max: state.range, value: secretValue, onChange: (event) => setSecretValue(event.target.value), placeholder: `1 to ${state.range}` }), _jsx("button", { disabled: busy, onClick: () => run(handleSubmitSecret, "Secret locked in."), children: "Lock in" })] }) : _jsxs("p", { className: "hero-copy", children: ["Waiting for ", activeSecretPlayer.name, " to choose a secret number."] })] }), state.status === "guess" && activeTurnPlayer && _jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Guess phase" }), _jsxs("p", { children: ["Current turn: ", _jsx("strong", { children: activeTurnPlayer.name })] }), _jsxs("p", { children: ["Range: 1 - ", state.range] }), _jsx("p", { className: "hero-copy", children: isViewerTurnForGuess ? "Pick a number from the board." : `Waiting for ${activeTurnPlayer.name} to move.` })] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "Board" }), _jsx("div", { className: "board", children: state.board.map((cell) => _jsx("button", { disabled: cell.gone || !isViewerTurnForGuess || busy, className: cell.gone ? "number number-gone" : "number", onClick: () => run(() => handleSubmitGuess(cell.n)), children: cell.gone ? "" : cell.n }, cell.n)) })] }), _jsxs("div", { className: "card", children: [_jsx("h2", { children: "Players" }), _jsx("div", { className: "list", children: state.players.map((player) => _jsxs("div", { className: "list-item", children: [_jsx("span", { children: player.name }), _jsx("span", { children: player.guessedBy ? `Found by ${player.guessedBy}` : "Still hiding" })] }, player.id)) })] })] }), state.status === "result" && _jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("h2", { children: "Results" }), _jsx("div", { className: "list", children: results.map((result) => _jsxs("div", { className: "result", children: [_jsx("strong", { children: result.playerName }), _jsx("span", { children: result.status.toUpperCase() }), _jsx("p", { children: result.subtitle })] }, result.playerId)) })] }), _jsx("button", { className: "primary", disabled: !activeGame.isHost || busy, onClick: () => run(handleResetGame, "Game reset for another round."), children: "Play again" })] })] }), feedback.error && _jsx("p", { className: "message error", children: feedback.error }), !feedback.error && (feedback.ok || latestLog()) && _jsx("p", { className: "message ok", children: feedback.ok || latestLog() })] }) }));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : "Unexpected error.";
}
