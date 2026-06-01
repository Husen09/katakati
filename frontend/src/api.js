const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export async function getProfile(session) {
    const response = await apiRequest("/auth/me", { session });
    return response.profile;
}
export async function listGames(session) {
    const response = await apiRequest("/games", { session });
    return response.games;
}
export async function createGame(session) {
    const response = await apiRequest("/games", { method: "POST", session });
    return response.game;
}
export async function joinGame(session, roomCode) {
    const response = await apiRequest("/games/join", {
        method: "POST",
        session,
        body: { roomCode }
    });
    return response.game;
}
export async function getGame(session, gameId) {
    const response = await apiRequest(`/games/${gameId}`, { session });
    return response.game;
}
export async function updateRange(session, gameId, range) {
    const response = await apiRequest(`/games/${gameId}/range`, {
        method: "POST",
        session,
        body: { range }
    });
    return response.game;
}
export async function startGame(session, gameId) {
    const response = await apiRequest(`/games/${gameId}/start`, {
        method: "POST",
        session
    });
    return response.game;
}
export async function submitSecret(session, gameId, secret) {
    const response = await apiRequest(`/games/${gameId}/secret`, {
        method: "POST",
        session,
        body: { secret }
    });
    return response.game;
}
export async function submitGuess(session, gameId, number) {
    const response = await apiRequest(`/games/${gameId}/guess`, {
        method: "POST",
        session,
        body: { number }
    });
    return response.game;
}
export async function resetGame(session, gameId) {
    const response = await apiRequest(`/games/${gameId}/reset`, {
        method: "POST",
        session
    });
    return response.game;
}
async function apiRequest(path, options) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.session.access_token}`
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = (await response.json());
    if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
    }
    return payload;
}
