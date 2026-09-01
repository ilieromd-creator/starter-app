import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('admin and user roles have different access levels', async () => {
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

  const adminLogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });

  const adminToken = (await adminLogin.json()).token;

  const userLogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'user', password: 'secret' })
  });

  const userToken = (await userLogin.json()).token;

  const adminDelete = await fetch(`${baseUrl}/items/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  assert.equal(adminDelete.status, 200);

  const userDelete = await fetch(`${baseUrl}/items/2`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` }
  });

  assert.equal(userDelete.status, 403);

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
