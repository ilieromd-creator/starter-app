import type { DatabaseInstance, FilterOptions, PriorityLevel, TaskStats, TodoItem } from '../database';
import { computeTaskStats, createItem, listItems, removeItem, updateItem } from '../database';

export function listTasks(
  db: DatabaseInstance,
  userId?: string,
  filters?: FilterOptions
): TodoItem[] | Promise<TodoItem[]> {
  return listItems(db, userId, filters);
}

export function createTask(
  db: DatabaseInstance,
  name: string,
  done = false,
  userId?: string,
  details?: {
    description?: string;
    priority?: PriorityLevel;
    category?: string;
    due_date?: string;
  }
): TodoItem | Promise<TodoItem> {
  return createItem(db, name, done, userId, details);
}

export function getTaskById(
  db: DatabaseInstance,
  id: number,
  userId?: string
): TodoItem | null | Promise<TodoItem | null> {
  const items = listItems(db, userId);
  if (items instanceof Promise) {
    return items.then((list) => list.find((task) => task.id === id) ?? null);
  }
  return items.find((task) => task.id === id) ?? null;
}

export function updateTask(
  db: DatabaseInstance,
  id: number,
  updates: Partial<Pick<TodoItem, 'name' | 'done' | 'description' | 'priority' | 'category' | 'due_date'>>,
  userId?: string
): TodoItem | null | Promise<TodoItem | null> {
  return updateItem(db, id, updates, userId);
}

export function deleteTask(db: DatabaseInstance, id: number, userId?: string): boolean | Promise<boolean> {
  return removeItem(db, id, userId);
}

export function getTaskStats(db: DatabaseInstance, userId?: string): TaskStats | Promise<TaskStats> {
  const items = listItems(db, userId);
  if (items instanceof Promise) {
    return items.then((list) => computeTaskStats(list));
  }
  return computeTaskStats(items);
}
