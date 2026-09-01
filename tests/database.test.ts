import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createItem,
  initializeDatabase,
  listItems,
  removeItem,
  updateItem
} from '../src/database';

test('database layer persists and updates items', () => {
  const dbDir = mkdtempSync(path.join(tmpdir(), 'starter-app-db-'));
  const dbPath = path.join(dbDir, 'app.db');
  const db = initializeDatabase(dbPath);

  const created = createItem(db, 'Persist in SQLite');
  assert.equal(created.name, 'Persist in SQLite');
  assert.equal(listItems(db).length, 1);

  const updated = updateItem(db, created.id, { done: true, name: 'Persist in SQLite updated' });
  assert.equal(updated?.done, true);
  assert.equal(updated?.name, 'Persist in SQLite updated');

  const removed = removeItem(db, created.id);
  assert.equal(removed, true);
  assert.equal(listItems(db).length, 0);

  db.close();
  rmSync(dbDir, { recursive: true, force: true });
});
