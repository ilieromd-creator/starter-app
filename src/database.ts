import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export interface TodoItem {
  id: number;
  user_id?: string;
  name: string;
  description?: string;
  priority?: PriorityLevel;
  category?: string;
  due_date?: string;
  done: boolean;
  created_at?: string;
}

export interface FilterOptions {
  search?: string;
  category?: string;
  priority?: string;
  status?: 'all' | 'active' | 'completed';
}

export interface TaskStats {
  total: number;
  completed: number;
  active: number;
  urgent: number;
  completionRate: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}

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
          {
            id: 1,
            name: 'Launch Starter App to Cloud',
            description: 'Deploy web service on Render with Supabase PostgreSQL',
            priority: 'urgent',
            category: 'Work',
            done: true,
            user_id: 'admin',
            created_at: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 2,
            name: 'Setup Supabase Row-Level Security',
            description: 'Define secure user isolation policies',
            priority: 'high',
            category: 'Work',
            done: true,
            user_id: 'user',
            created_at: new Date(Date.now() - 1800000).toISOString()
          },
          {
            id: 3,
            name: 'Explore SaaS Dashboard features',
            description: 'Test live search, priority tagging, and category filters',
            priority: 'medium',
            category: 'Learning',
            done: false,
            user_id: 'admin',
            created_at: new Date().toISOString()
          }
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

export function listItems(
  db: DatabaseInstance,
  userId?: string,
  filters?: FilterOptions
): TodoItem[] | Promise<TodoItem[]> {
  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      let query = db.client!
        .from('items')
        .select('id, name, description, priority, category, due_date, done, user_id, created_at')
        .order('id', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (filters?.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters?.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.status === 'active') {
        query = query.eq('done', false);
      } else if (filters?.status === 'completed') {
        query = query.eq('done', true);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Supabase query error: ${error.message}`);

      return (data || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        description: row.description || undefined,
        priority: (row.priority as PriorityLevel) || 'medium',
        category: row.category || 'Work',
        due_date: row.due_date || undefined,
        done: Boolean(row.done),
        user_id: row.user_id,
        created_at: row.created_at
      }));
    })();
  }

  // In-memory mode (for unit tests / mock)
  let items = db.memoryStore || [];
  if (userId) {
    items = items.filter((item) => !item.user_id || item.user_id === userId);
  }
  if (filters?.category && filters.category !== 'all') {
    items = items.filter((item) => item.category?.toLowerCase() === filters.category!.toLowerCase());
  }
  if (filters?.priority && filters.priority !== 'all') {
    items = items.filter((item) => item.priority === filters.priority);
  }
  if (filters?.status === 'active') {
    items = items.filter((item) => !item.done);
  } else if (filters?.status === 'completed') {
    items = items.filter((item) => item.done);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
    );
  }

  return [...items];
}

export function createItem(
  db: DatabaseInstance,
  name: string,
  done = false,
  userId = 'default-user',
  details?: {
    description?: string;
    priority?: PriorityLevel;
    category?: string;
    due_date?: string;
  }
): TodoItem | Promise<TodoItem> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }

  const priority = details?.priority || 'medium';
  const category = details?.category || 'Work';
  const description = details?.description?.trim() || undefined;
  const due_date = details?.due_date || undefined;

  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      const payload: Record<string, unknown> = {
        name: trimmed,
        done,
        user_id: userId,
        priority,
        category
      };
      if (description) payload.description = description;
      if (due_date) payload.due_date = due_date;

      const { data, error } = await db.client!
        .from('items')
        .insert(payload)
        .select('id, name, description, priority, category, due_date, done, user_id, created_at')
        .single();

      if (error) throw new Error(`Supabase insert error: ${error.message}`);

      return {
        id: Number(data.id),
        name: data.name,
        description: data.description || undefined,
        priority: (data.priority as PriorityLevel) || 'medium',
        category: data.category || 'Work',
        due_date: data.due_date || undefined,
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
    description,
    priority,
    category,
    due_date,
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
  updates: Partial<Pick<TodoItem, 'name' | 'done' | 'description' | 'priority' | 'category' | 'due_date'>>,
  userId?: string
): TodoItem | null | Promise<TodoItem | null> {
  if (db.mode === 'supabase' && db.client) {
    return (async () => {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.done !== undefined) payload.done = updates.done;
      if (updates.description !== undefined) payload.description = updates.description.trim() || null;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.due_date !== undefined) payload.due_date = updates.due_date || null;

      let query = db.client!.from('items').update(payload).eq('id', id);
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query
        .select('id, name, description, priority, category, due_date, done, user_id, created_at')
        .maybeSingle();

      if (error) throw new Error(`Supabase update error: ${error.message}`);
      if (!data) return null;

      return {
        id: Number(data.id),
        name: data.name,
        description: data.description || undefined,
        priority: (data.priority as PriorityLevel) || 'medium',
        category: data.category || 'Work',
        due_date: data.due_date || undefined,
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
    done: updates.done !== undefined ? updates.done : current.done,
    description: updates.description !== undefined ? updates.description.trim() : current.description,
    priority: updates.priority !== undefined ? updates.priority : current.priority,
    category: updates.category !== undefined ? updates.category : current.category,
    due_date: updates.due_date !== undefined ? updates.due_date : current.due_date
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

export function computeTaskStats(items: TodoItem[]): TaskStats {
  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const active = total - completed;
  const urgent = items.filter((i) => !i.done && i.priority === 'urgent').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const item of items) {
    const cat = item.category || 'General';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    const prio = item.priority || 'medium';
    byPriority[prio] = (byPriority[prio] || 0) + 1;
  }

  return {
    total,
    completed,
    active,
    urgent,
    completionRate,
    byCategory,
    byPriority
  };
}
