import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('login returns token and protected routes require auth', async () => {
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

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });

  const loginBody = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.ok(loginBody.token);

  const protectedResponse = await fetch(`${baseUrl}/items`, {
    headers: {
      Authorization: `Bearer ${loginBody.token}`
    }
  });

  assert.equal(protectedResponse.status, 200);

  const noTokenResponse = await fetch(`${baseUrl}/items`);
  assert.equal(noTokenResponse.status, 401);

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
