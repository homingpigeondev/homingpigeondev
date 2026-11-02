'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');
const { mockApi, tempHome, env } = require('./helpers');

const BIN = path.join(__dirname, '..', 'bin', 'homingpigeon.js');
let api;
let home;
let client;
let transport;

// Uses the official MCP client, so this checks real protocol conformance.
beforeEach(async () => {
  api = await mockApi();
  home = tempHome();
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  transport = new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], env: env(home, api) });
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
});
afterEach(async () => {
  await client.close();
  await api.close();
  home.cleanup();
});

const call = (name, args = {}) => client.callTool({ name, arguments: args });
const parsed = (result) => JSON.parse(result.content[0].text);
const verify = async () => {
  await call('verify', { phone: '+15551231234' });
  return call('verify', { phone: '+15551231234', code: '123456' });
};

test('it exposes exactly verify, send and status', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['verify', 'send', 'status']);
  const send = tools.find((t) => t.name === 'send');
  assert.equal(send.description, "Send a text message to the account owner's verified phone. The recipient is fixed; `message` is the only required field.");
  assert.deepEqual(send.inputSchema.required, ['message']);
  assert.deepEqual(Object.keys(send.inputSchema.properties).sort(), ['idempotency_key', 'message']);
  assert.equal(client.getServerVersion().name, 'homingpigeondev');
});

test('the verified key is saved locally and never shown to the agent', async () => {
  const result = await verify();
  assert.equal(result.isError, undefined);
  assert.doesNotMatch(JSON.stringify(result), /hp_test/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home.configDir, 'config.json'), 'utf8')).apiKey, 'hp_test');
});

test('send and status work after verify', async () => {
  await verify();
  assert.equal(parsed(await call('send', { message: 'Done.' })).id, 'msg_1');
  assert.equal(parsed(await call('status')).messages_remaining, 49);
  assert.equal(api.sends()[0].body.message, 'Done.');
});

test('send before verify tells the agent what to do', async () => {
  const result = await call('send', { message: 'Done.' });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).code, 'key_not_verified');
  assert.match(parsed(result).next_step, /verify/);
});

test('misuse: an agent trying to text someone else is steered back', async () => {
  await verify();
  const result = await call('send', { message: 'hi', to: '+13135551234' });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).code, 'no_to_field');
});

test('a wrong code comes back as a tool error, not a crash', async () => {
  const result = await call('verify', { phone: '+15551231234', code: '000000' });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).code, 'wrong_code');
});

test('an unknown tool is reported as a tool error', async () => {
  const result = await call('nope');
  assert.equal(result.isError, true);
});
