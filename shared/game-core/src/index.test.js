import test from "node:test";
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

test("keeps the original winner logic where found players are winners", () => {
  let state = createGameState();
  state = setRange(state, 10);
  state = addPlayer(state, "Asha");
  state = addPlayer(state, "Bilal");
  state = startSecretPhase(state);
  state = saveSecret(state, 2);
  state = saveSecret(state, 7);
  state = makeGuess(state, 7);

  assert.equal(state.status, "result");

  const results = getResults(state);
  assert.equal(results[0].playerName, "Bilal");
  assert.equal(results[0].status, "winner");
  assert.equal(results[1].playerName, "Asha");
  assert.equal(results[1].status, "loser");
});

test("removes self-hit numbers without counting them as a secret found", () => {
  let state = createGameState();
  state = setRange(state, 10);
  state = addPlayer(state, "Asha");
  state = addPlayer(state, "Bilal");
  state = startSecretPhase(state);
  state = saveSecret(state, 2);
  state = saveSecret(state, 7);
  state = makeGuess(state, 2);

  assert.equal(state.status, "guess");
  assert.equal(state.players[0].guessedBy, null);
  assert.equal(state.logs[0].hit, false);
});
