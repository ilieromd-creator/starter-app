import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('deployment metadata and startup env are ready for cloud hosting', async () => {
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
  const metrics = await fetch(`${baseUrl}/metrics`);

  assert.equal(health.status, 200);
  assert.equal(metrics.status, 200);

  const healthBody = await health.json();
  const metricsBody = await metrics.json();
  assert.equal(healthBody.service, 'starter-app');
  assert.ok(metricsBody.uptimeMs >= 0);

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
