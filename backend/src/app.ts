import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  makeGuess,
  saveSecret,
  setRange,
  startSecretPhase
} from "@katrekat/game-core";
import { requireAuth, type AuthenticatedRequest } from "./auth.js";
import {
  listRoomMessagesForUser,
  createGameForHost,
  getGameForUser,
  joinGameByRoomCode,
  listGamesForUser,
  requireCurrentSecretPlayer,
  requireCurrentTurnPlayer,
  requireHost,
  resetGameForHost,
  sendRoomMessageForUser,
  updateGameForUser
} from "./gameStore.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(requireAuth);

  app.get("/auth/me", (req, res) => {
    res.json({ profile: getProfile(req) });
  });

  app.get("/games", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      res.json({ games: await listGamesForUser(profile.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await createGameForHost(profile, req.body.purpose ? String(req.body.purpose) : undefined);
      res.status(201).json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/join", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await joinGameByRoomCode(String(req.body.roomCode ?? ""), profile);
      res.status(201).json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.get("/games/:gameId", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      res.json({ game: await getGameForUser(req.params.gameId, profile.id) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/games/:gameId/messages", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      res.json({ messages: await listRoomMessagesForUser(req.params.gameId, profile.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/messages", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      res.status(201).json({
        message: await sendRoomMessageForUser(req.params.gameId, profile.id, String(req.body.message ?? ""))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/range", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await updateGameForUser(req.params.gameId, profile.id, (state, context) => {
        requireHost(context);
        return setRange(state, Number(req.body.range));
      });
      res.json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/purpose", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await updateGameForUser(req.params.gameId, profile.id, (state, context) => {
        requireHost(context);
        return {
          ...state,
          purpose: String(req.body.purpose ?? "")
        };
      });
      res.json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/start", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await updateGameForUser(req.params.gameId, profile.id, (state, context) => {
        requireHost(context);
        return startSecretPhase(state);
      });
      res.json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/secret", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await updateGameForUser(req.params.gameId, profile.id, (state, context) => {
        requireCurrentSecretPlayer(state, context.participant);
        return saveSecret(state, Number(req.body.secret));
      });
      res.json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/guess", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      const game = await updateGameForUser(req.params.gameId, profile.id, (state, context) => {
        requireCurrentTurnPlayer(state, context.participant);
        return makeGuess(state, Number(req.body.number));
      });
      res.json({ game });
    } catch (error) {
      next(error);
    }
  });

  app.post("/games/:gameId/reset", async (req, res, next) => {
    try {
      const profile = getProfile(req);
      res.json({ game: await resetGameForHost(req.params.gameId, profile.id) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = isAuthError(message) ? 401 : 400;
    res.status(status).json({ error: message });
  });

  return app;
}

function isAuthError(message: string) {
  return message === "Please sign in first." || message === "Missing authorization token.";
}

function getProfile(req: Request) {
  return (req as unknown as AuthenticatedRequest).profile;
}
