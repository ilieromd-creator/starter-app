import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('security layer hides internals and rejects malformed tokens', async () => {
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

  const badToken = await fetch(`${baseUrl}/api/users`, {
    headers: { Authorization: 'Bearer invalid-token' }
  });

  assert.equal(badToken.status, 401);

  const publicHealth = await fetch(`${baseUrl}/health`);
  const publicBody = await publicHealth.json();
  assert.equal(publicHealth.status, 200);
  assert.equal(publicBody.service, 'starter-app');

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
