import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('separate frontend static files are served', async () => {
  const server = app.listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address type');
  }

  const response = await fetch(`http://localhost:${address.port}/app/index.html`);
  const html = await response.text();

  assert.equal(response.status, 200);
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
