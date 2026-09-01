import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('user management supports profile lookup and list users', async () => {
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

  const usersResponse = await fetch(`${baseUrl}/api/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(usersResponse.status, 200);

  const userResponse = await fetch(`${baseUrl}/api/users/admin`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(userResponse.status, 200);

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
