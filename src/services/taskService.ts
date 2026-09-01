import type { DatabaseInstance, TodoItem } from '../database';
import { createItem, listItems, removeItem, updateItem } from '../database';

export function listTasks(db: DatabaseInstance, userId?: string): TodoItem[] | Promise<TodoItem[]> {
  return listItems(db, userId);
}

export function createTask(
  db: DatabaseInstance,
  name: string,
  done = false,
  userId?: string
): TodoItem | Promise<TodoItem> {
  return createItem(db, name, done, userId);
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
  updates: Partial<Pick<TodoItem, 'name' | 'done'>>,
  userId?: string
): TodoItem | null | Promise<TodoItem | null> {
  return updateItem(db, id, updates, userId);
}

export function deleteTask(db: DatabaseInstance, id: number, userId?: string): boolean | Promise<boolean> {
  return removeItem(db, id, userId);
}
