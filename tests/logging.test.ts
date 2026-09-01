import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('logging middleware records request metadata', async () => {
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
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);

  const logs = await fetch(`${baseUrl}/logs`);
  const body = await logs.json();

  assert.equal(logs.status, 200);
  assert.ok(Array.isArray(body));

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
