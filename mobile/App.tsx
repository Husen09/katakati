import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  RANGES,
  addPlayer,
  createGameState,
  getResults,
  makeGuess,
  resetGame,
  saveSecret,
  setRange,
  startSecretPhase,
  type GameState
} from "@katrekat/game-core";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

export default function App() {
  const [state, setState] = useState<GameState>(() => createGameState());
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const results = useMemo(() => getResults(state), [state]);

  function run(action: () => GameState) {
    try {
      setState(action());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error.");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>React Native</Text>
        <Text style={styles.title}>Number Guess</Text>
        <Text style={styles.subtitle}>Same logic, mobile shell.</Text>

        {state.status === "setup" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Choose range</Text>
            <View style={styles.rangeWrap}>
              {RANGES.map((range) => (
                <Pressable
                  key={range}
                  style={[styles.chip, state.range === range && styles.chipActive]}
                  onPress={() => run(() => setRange(state, range))}
                >
                  <Text style={[styles.chipText, state.range === range && styles.chipTextActive]}>
                    1 - {range}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Players</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                placeholder="Player name"
                value={name}
                onChangeText={setName}
              />
              <Pressable
                style={styles.button}
                onPress={() =>
                  run(() => {
                    const next = addPlayer(state, name);
                    setName("");
                    return next;
                  })
                }
              >
                <Text style={styles.buttonText}>Add</Text>
              </Pressable>
            </View>

            {state.players.map((player) => (
              <Text key={player.id} style={styles.playerRow}>
                {player.name}
              </Text>
            ))}

            <Pressable style={[styles.button, styles.primary]} onPress={() => run(() => startSecretPhase(state))}>
              <Text style={styles.buttonText}>Start game</Text>
            </Pressable>
          </View>
        )}

        {state.status === "secret" && state.players[state.secIdx] && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Secret entry</Text>
            <Text style={styles.note}>{state.players[state.secIdx].name} picks a secret</Text>
            <TextInput
              style={styles.input}
              placeholder={`1 to ${state.range}`}
              value={secret}
              keyboardType="number-pad"
              onChangeText={setSecret}
            />
            <Pressable
              style={[styles.button, styles.primary]}
              onPress={() =>
                run(() => {
                  const next = saveSecret(state, Number(secret));
                  setSecret("");
                  return next;
                })
              }
            >
              <Text style={styles.buttonText}>Lock in</Text>
            </Pressable>
          </View>
        )}

        {state.status === "guess" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Guess phase</Text>
            <Text style={styles.note}>{state.players[state.turn]?.name}'s turn</Text>
            <View style={styles.board}>
              {state.board.map((cell) => (
                <Pressable
                  key={cell.n}
                  disabled={cell.gone}
                  style={[styles.number, cell.gone && styles.gone]}
                  onPress={() => {
                    try {
                      const next = makeGuess(state, cell.n);
                      setState(next);
                      setMessage(next.logs[next.logs.length - 1]?.msg ?? "");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Unexpected error.");
                    }
                  }}
                >
                  <Text style={styles.numberText}>{cell.gone ? "" : cell.n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {state.status === "result" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Results</Text>
            {results.map((result) => (
              <View key={result.playerId} style={styles.result}>
                <Text style={styles.resultName}>
                  {result.playerName} - {result.status}
                </Text>
                <Text style={styles.note}>{result.subtitle}</Text>
              </View>
            ))}

            <Pressable style={[styles.button, styles.primary]} onPress={() => run(() => resetGame(state))}>
              <Text style={styles.buttonText}>Play again</Text>
            </Pressable>
          </View>
        )}

        {!!message && <Text style={styles.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#ece7fb"
  },
  container: {
    padding: 20,
    gap: 16
  },
  eyebrow: {
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 2,
    color: "#6f65bf"
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#261f4f"
  },
  subtitle: {
    color: "#6c6491"
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#312868"
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  input: {
    flex: 1,
    backgroundColor: "#f4f1ff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  button: {
    backgroundColor: "#534ab7",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  primary: {
    marginTop: 6
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700"
  },
  rangeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    backgroundColor: "#f3efff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chipActive: {
    backgroundColor: "#534ab7"
  },
  chipText: {
    color: "#534ab7"
  },
  chipTextActive: {
    color: "#fff"
  },
  playerRow: {
    color: "#453d79"
  },
  note: {
    color: "#6b6491"
  },
  board: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  number: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#f3efff",
    alignItems: "center",
    justifyContent: "center"
  },
  gone: {
    opacity: 0.25
  },
  numberText: {
    color: "#4d45b2",
    fontWeight: "700"
  },
  result: {
    gap: 4,
    paddingVertical: 8
  },
  resultName: {
    fontWeight: "700",
    color: "#2b2458"
  },
  message: {
    color: "#15775d",
    fontWeight: "600"
  }
});
