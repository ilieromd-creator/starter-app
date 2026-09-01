import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('api exposes organized modules and route names', async () => {
  const server = app.listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address type');
  }

  const baseUrl = `http://localhost:${address.port}`;
  const login = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });

  const { token } = await login.json();

  const users = await fetch(`${baseUrl}/api/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(users.status, 200);

  const tasks = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(tasks.status, 200);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});
