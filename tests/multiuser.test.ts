import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('multi-user login supports admin and user accounts with role-specific access', async () => {
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

  const admin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });

  const adminBody = await admin.json();
  assert.equal(admin.status, 200);
  assert.equal(adminBody.role, 'admin');

  const user = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'user', password: 'secret' })
  });

  const userBody = await user.json();
  assert.equal(user.status, 200);
  assert.equal(userBody.role, 'user');

  const access = await fetch(`${baseUrl}/items`, {
    headers: { Authorization: `Bearer ${userBody.token}` }
  });
  assert.equal(access.status, 200);

  const forbidden = await fetch(`${baseUrl}/items/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userBody.token}` }
  });
  assert.equal(forbidden.status, 403);

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
