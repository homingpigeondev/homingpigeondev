'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');
const { mockApi, tempHome, env } = require('./helpers');

const BIN = path.join(__dirname, '..', 'bin', 'homingpigeon.js');
let api;
let home;

function run(args, { input, extra } = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [BIN, ...args], { env: env(home, api, extra) }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr })
    );
    child.stdin.end(input || '');
  });
}

const signIn = () => run(['verify', '+15551231234', '123456']);

beforeEach(async () => {
  api = await mockApi();
  home = tempHome();
});
afterEach(async () => {
  await api.close();
  home.cleanup();
});

test('verify saves the key with private permissions and never prints it', async () => {
  const first = await run(['verify', '+15551231234']);
  assert.match(first.stdout, /Code sent/);
  const second = await signIn();
  assert.equal(second.code, 0);
  assert.doesNotMatch(second.stdout, /hp_test/);
  const file = path.join(home.configDir, 'config.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, 'hp_test');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('send works from arguments and from a pipe', async () => {
  await signIn();
  assert.equal((await run(['send', 'Backtest', 'finished.'])).code, 0);
  assert.equal((await run(['send'], { input: 'From a pipe\n' })).code, 0);
  assert.deepEqual(api.sends().map((c) => c.body.message), ['Backtest finished.', 'From a pipe']);
});

test('the env key wins, and send never includes a recipient', async () => {
  await run(['send', 'hi'], { extra: { HOMINGPIGEON_API_KEY: 'hp_test' } });
  assert.deepEqual(Object.keys(api.sends()[0].body).filter((k) => k !== 'idempotency_key'), ['message']);
});

test('errors exit non-zero and print the next step', async () => {
  const noKey = await run(['send', 'hi']);
  assert.equal(noKey.code, 1);
  assert.match(noKey.stderr, /No Homing Pigeon key/);
  assert.match(noKey.stderr, /verify/);
  const wrong = await run(['verify', '+15551231234', '000000']);
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /re-read/);
});

test('--json errors are machine readable', async () => {
  const result = await run(['send', 'hi', '--json']);
  assert.equal(JSON.parse(result.stderr).error.code, 'key_not_verified');
});

test('status and key report the saved account', async () => {
  await signIn();
  assert.match((await run(['status'])).stdout, /Messages left: 49/);
  assert.equal((await run(['key'])).stdout.trim(), 'hp_test');
});

test('hook install refuses until the phone is verified', async () => {
  const result = await run(['hook', 'install', 'claude-code']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Verify your phone/);
  assert.equal(fs.existsSync(path.join(home.home, '.claude', 'settings.json')), false);
});
