import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index';

test('health and items API work as expected', async () => {
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

  const healthResponse = await fetch(`${baseUrl}/health`);
  const healthBody = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.status, 'ok');

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });
  const { token } = await loginResponse.json();

  const createResponse = await fetch(`${baseUrl}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Write tests', done: true })
  });

  const createdItem = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(createdItem.name, 'Write tests');
  assert.equal(createdItem.done, true);

  const listResponse = await fetch(`${baseUrl}/items`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listBody = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.ok(Array.isArray(listBody));
  assert.ok(listBody.some((item: { name: string }) => item.name === 'Write tests'));

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
