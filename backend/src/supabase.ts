import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isMockMode = !supabaseUrl || !serviceRoleKey;

function createMockBackendSupabase() {
  const profiles = new Map<string, any>();
  const games = new Map<string, any>();
  const messages: any[] = [];

  class QueryBuilder {
    table: string;
    filters: Array<(item: any) => boolean> = [];
    orderByField: string | null = null;
    orderByAscending = true;
    limitCount: number | null = null;
    updateData: any = null;
    insertData: any = null;

    constructor(table: string) {
      this.table = table;
    }

    insert(data: any) {
      this.insertData = data;
      return this;
    }

    upsert(data: any, options?: any) {
      this.insertData = data;
      return this;
    }

    update(data: any) {
      this.updateData = data;
      return this;
    }

    select(columns?: string) {
      return this;
    }

    eq(field: string, value: any) {
      this.filters.push((item) => {
        if (field === "room_code") return item.room_code === value;
        if (field === "game_id") return item.game_id === value;
        if (field === "id") return item.id === value;
        return item[field] === value;
      });
      return this;
    }

    order(field: string, options?: { ascending?: boolean }) {
      this.orderByField = field;
      this.orderByAscending = options?.ascending ?? true;
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    async single() {
      const res = await this.execute();
      if (res.error) return { data: null, error: res.error };
      if (!res.data || res.data.length === 0) {
        return { data: null, error: new Error("Row not found") };
      }
      return { data: res.data[0], error: null };
    }

    async execute() {
      try {
        let items: any[] = [];
        if (this.table === "profiles") {
          items = Array.from(profiles.values());
        } else if (this.table === "games") {
          items = Array.from(games.values());
        } else if (this.table === "room_messages") {
          items = messages;
        }

        // Perform insert / upsert if any
        if (this.insertData) {
          const arr = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
          const inserted: any[] = [];
          for (let row of arr) {
            const newRow = { ...row };
            if (!newRow.id) {
              newRow.id = `mock-id-${Math.random().toString(36).substring(2, 11)}`;
            }
            if (!newRow.created_at) newRow.created_at = new Date().toISOString();
            if (!newRow.updated_at) newRow.updated_at = new Date().toISOString();
            
            if (this.table === "profiles") {
              profiles.set(newRow.id, { ...profiles.get(newRow.id), ...newRow });
            } else if (this.table === "games") {
              if (newRow.room_code && Array.from(games.values()).some((g: any) => g.room_code === newRow.room_code && g.id !== newRow.id)) {
                return { data: null, error: { code: "23505", message: "Room code duplicate" } };
              }
              games.set(newRow.id, { ...games.get(newRow.id), ...newRow });
            } else if (this.table === "room_messages") {
              messages.push(newRow);
            }
            
            const saved = this.table === "profiles"
              ? profiles.get(newRow.id)
              : (this.table === "games" ? games.get(newRow.id) : newRow);
            inserted.push(saved);
          }
          return { data: inserted, error: null };
        }

        // Perform update if any
        if (this.updateData) {
          const matched = items.filter(item => {
            return this.filters.every(f => f(item));
          });
          for (let item of matched) {
            const updated = { ...item, ...this.updateData, updated_at: new Date().toISOString() };
            if (this.table === "profiles") {
              profiles.set(updated.id, updated);
            } else if (this.table === "games") {
              games.set(updated.id, updated);
            }
          }
          return {
            data: matched.map(m => {
              if (this.table === "profiles") return profiles.get(m.id);
              if (this.table === "games") return games.get(m.id);
              return m;
            }),
            error: null
          };
        }

        // Filter items
        let result = items.filter(item => {
          return this.filters.every(f => f(item));
        });

        // Order items
        if (this.orderByField) {
          result.sort((a, b) => {
            const valA = a[this.orderByField!];
            const valB = b[this.orderByField!];
            if (valA < valB) return this.orderByAscending ? -1 : 1;
            if (valA > valB) return this.orderByAscending ? 1 : -1;
            return 0;
          });
        }

        // Limit count
        if (this.limitCount !== null) {
          result = result.slice(0, this.limitCount);
        }

        return { data: result, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    }

    then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
      return this.execute().then(onfulfilled, onrejected);
    }
  }

  return {
    auth: {
      async getUser(token: string) {
        if (!token.startsWith("mock-token-")) {
          return { data: { user: null }, error: new Error("Invalid token format") };
        }
        // Extract display name from token if it contains info, e.g., mock-token-userid_name
        const parts = token.substring("mock-token-".length).split("_");
        const userId = parts[0] || "mock-user";
        const displayName = parts[1] ? decodeURIComponent(parts[1]) : "Mock Player";
        return {
          data: {
            user: {
              id: userId,
              email: `${userId}@mock.com`,
              user_metadata: { display_name: displayName }
            }
          },
          error: null
        };
      }
    },
    from(table: string) {
      return new QueryBuilder(table);
    }
  };
}

export const supabaseAdmin: any = isMockMode
  ? createMockBackendSupabase()
  : createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

