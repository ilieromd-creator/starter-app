import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type TodoItem = {
  id: number;
  user_id?: string;
  name: string;
  done: boolean;
  created_at?: string;
};

export interface DatabaseInstance {
  client: SupabaseClient | null;
  mode: 'supabase' | 'memory';
  memoryStore?: TodoItem[];
  close: () => void;
}

export function initializeDatabase(
  options?: string | {
    supabaseUrl?: string;
    supabaseKey?: string;
    forceMemory?: boolean;
    seed?: boolean;
  }
): DatabaseInstance {
  const opts = typeof options === 'object' && options !== null ? options : undefined;
  const url = opts?.supabaseUrl || process.env.SUPABASE_URL;
  const key = opts?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (opts?.forceMemory || !url || !key) {
    const isIsolatedTestDb = typeof options === 'string' || opts?.seed === false;
    const memoryStore: TodoItem[] = isIsolatedTestDb
      ? []
      : [
          { id: 1, name: 'Default Setup Task', done: false, user_id: 'admin' },
          { id: 2, name: 'Welcome to Starter App', done: true, user_id: 'user' }
        ];

    return {
      client: null,
      mode: 'memory',
      memoryStore,
      close: () => {
        memoryStore.length = 0;
      }
    };
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return {
    client,
    mode: 'supabase',
    close: () => {}
  };
}

export function listItems(db: DatabaseInstance, userId?: string): TodoItem[] | Promise<TodoItem[]> {
  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      let query = db.client!.from('items').select('id, name, done, user_id, created_at').order('id', { ascending: true });
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query;
      if (error) throw new Error(`Supabase query error: ${error.message}`);
      return (data || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        done: Boolean(row.done),
        user_id: row.user_id,
        created_at: row.created_at
      }));
    })();
  }

  // In-memory mode
  const store = db.memoryStore || [];
  if (userId) {
    return store.filter((item) => !item.user_id || item.user_id === userId);
  }
  return [...store];
}

export function createItem(
  db: DatabaseInstance,
  name: string,
  done = false,
  userId = 'default-user'
): TodoItem | Promise<TodoItem> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }

  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      const { data, error } = await db.client!
        .from('items')
        .insert({
          name: trimmed,
          done,
          user_id: userId
        })
        .select('id, name, done, user_id, created_at')
        .single();

      if (error) throw new Error(`Supabase insert error: ${error.message}`);
      return {
        id: Number(data.id),
        name: data.name,
        done: Boolean(data.done),
        user_id: data.user_id,
        created_at: data.created_at
      };
    })();
  }

  const store = db.memoryStore || [];
  const nextId = store.length > 0 ? Math.max(...store.map((i) => i.id)) + 1 : 1;
  const newItem: TodoItem = {
    id: nextId,
    name: trimmed,
    done,
    user_id: userId,
    created_at: new Date().toISOString()
  };
  store.push(newItem);
  return newItem;
}

export function updateItem(
  db: DatabaseInstance,
  id: number,
  updates: Partial<Pick<TodoItem, 'name' | 'done'>>,
  userId?: string
): TodoItem | null | Promise<TodoItem | null> {
  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      let query = db.client!
        .from('items')
        .update({
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.done !== undefined ? { done: updates.done } : {})
        })
        .eq('id', id);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.select('id, name, done, user_id, created_at').maybeSingle();
      if (error) throw new Error(`Supabase update error: ${error.message}`);
      if (!data) return null;

      return {
        id: Number(data.id),
        name: data.name,
        done: Boolean(data.done),
        user_id: data.user_id,
        created_at: data.created_at
      };
    })();
  }

  const store = db.memoryStore || [];
  const index = store.findIndex((item) => item.id === id && (!userId || item.user_id === userId));
  if (index === -1) return null;

  const current = store[index];
  const updated: TodoItem = {
    ...current,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    done: updates.done !== undefined ? updates.done : current.done
  };
  store[index] = updated;
  return updated;
}

export function removeItem(db: DatabaseInstance, id: number, userId?: string): boolean | Promise<boolean> {
  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      let query = db.client!.from('items').delete().eq('id', id);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { error, count } = await query;
      if (error) throw new Error(`Supabase delete error: ${error.message}`);
      return (count ?? 1) > 0;
    })();
  }

  const store = db.memoryStore || [];
  const index = store.findIndex((item) => item.id === id && (!userId || item.user_id === userId));
  if (index === -1) return false;

  store.splice(index, 1);
  return true;
}
