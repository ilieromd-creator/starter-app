import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('app exposes build and health metadata needed for deployment', async () => {
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

  const health = await fetch(`${baseUrl}/health`);
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.service, 'starter-app');

  const root = await fetch(`${baseUrl}/`);
  const html = await root.text();
  assert.equal(root.status, 200);
  assert.match(html, /Todo App|Frontend/i);

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
