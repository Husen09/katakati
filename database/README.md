# Database Notes

The backend now persists online rooms in Supabase and uses Auth-backed profiles.

## Active tables

- `profiles`: one row per signed-in user
- `games`: room metadata, full serialized game state, and participant mapping

## Legacy support tables

These remain in the schema because they match the earlier normalized design and can still be useful later:

- `game_players`
- `game_board_cells`
- `game_logs`

## Current persistence model

The live backend stores the full game snapshot in `games.state` and the room membership map in `games.participants`.

That keeps each move to a single row update, which is a good fit for Render + Netlify deployment and a lightweight multiplayer room flow.

## Next upgrades

- add Supabase Realtime subscriptions instead of frontend polling
- add Row Level Security policies if you want direct client reads later
- optionally split room state back into normalized tables for analytics or replay history
