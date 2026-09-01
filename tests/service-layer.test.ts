import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../src/database';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  updateTask
} from '../src/services/taskService';

import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

test('service layer handles CRUD operations cleanly', () => {
  const dbDir = mkdtempSync(path.join(tmpdir(), 'starter-app-service-'));
  const dbPath = path.join(dbDir, 'tasks.db');
  const db = initializeDatabase(dbPath);

  const created = createTask(db, 'Refactor service layer');
  assert.equal(created.name, 'Refactor service layer');
  assert.equal(listTasks(db).length, 1);

  const updated = updateTask(db, created.id, { done: true, name: 'Refactor service layer done' });
  assert.equal(updated?.done, true);
  assert.equal(updated?.name, 'Refactor service layer done');

  const fetched = getTaskById(db, created.id);
  assert.equal(fetched?.id, created.id);

  assert.equal(deleteTask(db, created.id), true);
  assert.equal(listTasks(db).length, 0);

  db.close();
  rmSync(dbDir, { recursive: true, force: true });
});
