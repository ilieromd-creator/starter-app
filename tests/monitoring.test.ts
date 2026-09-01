import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('monitoring endpoint exposes app metadata and uptime information', async () => {
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
  const response = await fetch(`${baseUrl}/metrics`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(body.uptimeMs >= 0);
  assert.equal(body.service, 'starter-app');

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
