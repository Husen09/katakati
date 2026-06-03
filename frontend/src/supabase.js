import { createClient } from "@supabase/supabase-js";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isMockMode = !supabaseUrl || !supabaseAnonKey;
function createMockSupabaseClient() {
    let session = getMockSession();
    const listeners = new Set();
    function getMockSession() {
        const saved = localStorage.getItem("mock_supabase_session");
        return saved ? JSON.parse(saved) : null;
    }
    function saveMockSession(newSession) {
        if (newSession) {
            localStorage.setItem("mock_supabase_session", JSON.stringify(newSession));
        }
        else {
            localStorage.removeItem("mock_supabase_session");
        }
        session = newSession;
        listeners.forEach((cb) => cb(newSession ? "SIGNED_IN" : "SIGNED_OUT", newSession));
    }
    return {
        auth: {
            async getSession() {
                return { data: { session }, error: null };
            },
            onAuthStateChange(callback) {
                listeners.add(callback);
                // Initial call
                setTimeout(() => callback("INITIAL", session), 0);
                return {
                    data: {
                        subscription: {
                            unsubscribe() {
                                listeners.delete(callback);
                            }
                        }
                    }
                };
            },
            async signUp({ email, password, options }) {
                const users = JSON.parse(localStorage.getItem("mock_supabase_users") || "[]");
                if (users.some((u) => u.email === email)) {
                    return { data: { user: null }, error: new Error("User already exists.") };
                }
                const displayName = options?.data?.display_name || email.split("@")[0] || "Player";
                const userId = `user-${email.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
                const user = {
                    id: userId,
                    email,
                    user_metadata: { display_name: displayName }
                };
                users.push({ ...user, password });
                localStorage.setItem("mock_supabase_users", JSON.stringify(users));
                const newSession = {
                    access_token: `mock-token-${userId}_${encodeURIComponent(displayName)}`,
                    user
                };
                saveMockSession(newSession);
                return { data: { session: newSession, user }, error: null };
            },
            async signInWithPassword({ email, password }) {
                const users = JSON.parse(localStorage.getItem("mock_supabase_users") || "[]");
                const userRecord = users.find((u) => u.email === email && u.password === password);
                if (!userRecord) {
                    return { data: { session: null, user: null }, error: new Error("Invalid credentials.") };
                }
                const { password: _, ...user } = userRecord;
                const displayName = user.user_metadata?.display_name || user.email.split("@")[0] || "Player";
                const newSession = {
                    access_token: `mock-token-${user.id}_${encodeURIComponent(displayName)}`,
                    user
                };
                saveMockSession(newSession);
                return { data: { session: newSession, user }, error: null };
            },
            async signOut() {
                saveMockSession(null);
                return { error: null };
            }
        }
    };
}
export const supabase = isMockMode
    ? createMockSupabaseClient()
    : createClient(supabaseUrl, supabaseAnonKey);
