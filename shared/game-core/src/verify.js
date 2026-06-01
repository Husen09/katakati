import assert from "node:assert/strict";
import {
  addPlayer,
  createGameState,
  getResults,
  makeGuess,
  saveSecret,
  setRange,
  startSecretPhase
} from "./index.ts";

function runChecks() {
  let state = createGameState();
  state = setRange(state, 10);
  state = addPlayer(state, "Asha");
  state = addPlayer(state, "Bilal");
  state = startSecretPhase(state);
  state = saveSecret(state, 2);
  state = saveSecret(state, 7);

  const selfHitState = makeGuess(state, 2);
  assert.equal(selfHitState.status, "guess");
  assert.equal(selfHitState.players[0].guessedBy, null);
  assert.equal(selfHitState.logs[0].hit, false);

  let winnerState = createGameState();
  winnerState = setRange(winnerState, 10);
  winnerState = addPlayer(winnerState, "Asha");
  winnerState = addPlayer(winnerState, "Bilal");
  winnerState = startSecretPhase(winnerState);
  winnerState = saveSecret(winnerState, 2);
  winnerState = saveSecret(winnerState, 7);
  winnerState = makeGuess(winnerState, 7);

  assert.equal(winnerState.status, "result");
  const results = getResults(winnerState);
  assert.equal(results[0].playerName, "Bilal");
  assert.equal(results[0].status, "winner");
  assert.equal(results[1].playerName, "Asha");
  assert.equal(results[1].status, "loser");

  console.log("Shared game-core verification passed.");
}

runChecks();
