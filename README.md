# Number Guess Monorepo

This workspace now supports online multiplayer with simple Supabase login and a shared backend.

- `frontend/`: React web app for login, lobby, room flow, and gameplay
- `backend/`: authenticated API for room creation, joining, turns, and persistence
- `mobile/`: React Native / Expo app
- `database/`: Supabase SQL schema
- `shared/game-core/`: shared game rules used by both frontend and backend

## Current architecture

- Supabase Auth handles email/password sign in
- the frontend sends the Supabase access token to the backend
- the backend verifies the user, applies the shared game rules, and saves room state in Supabase
- the frontend polls the backend for fresh room state so multiple players can play online

## Core rule promise

The shared engine preserves the current gameplay:

- players choose a range
- 2 to 8 players join
- each player picks a unique secret number
- turns rotate through all players
- each picked number is removed from the board
- if a player finds another player's secret, the hidden player is marked as found
- if a player hits their own secret, it is only removed from the board
- the game ends when one hidden player remains or the board is empty
- results keep the current behavior: found players are shown as winners, hidden survivors are shown as losers

## Environment

Frontend `.env`

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Backend `.env`

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT`

## Local setup

1. Run `npm install`
2. Apply [`database/schema.sql`](E:/katrekat/database/schema.sql) to your Supabase project
3. Make sure Supabase email/password auth is enabled
4. Set the frontend and backend environment variables
5. Run `npm --workspace backend run dev`
6. Run `npm --workspace frontend run dev`

## Deploy

- Netlify:
  - base directory: `frontend`
  - build command: `npm --workspace frontend run build`
  - publish directory: `frontend/dist`
- Render:
  - root directory: `backend`
  - build command: `npm install && npm --workspace backend run build`
  - start command: `npm --workspace backend run start`
