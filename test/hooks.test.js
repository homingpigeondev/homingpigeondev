'use strict';

const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test, beforeEach, afterEach } = require('node:test');
const { mockApi, tempHome, env } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'homingpigeon.js');
const HOOK = path.join(ROOT, 'src', 'hooks', 'hook.js');
let api;
let home;

const cli = (args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: env(home, api) }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });

function fire(agent, payload, file = HOOK) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, agent], { env: env(home, api) });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}

function config(values) {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(path.join(home.configDir, 'config.json'), JSON.stringify({ apiKey: 'hp_test', ...values }));
}

// Pretends the turn began `minutes` ago.
function backdate(minutes) {
  const dir = path.join(home.configDir, 'hook-state');
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.startedAt = Date.now() - minutes * 60000;
    fs.writeFileSync(file, JSON.stringify(state));
  }
}

const claude = (event, extra = {}) => ({ session_id: 's1', cwd: '/work/my-repo', hook_event_name: event, ...extra });

beforeEach(async () => {
  api = await mockApi();
  home = tempHome();
});
afterEach(async () => {
  await api.close();
  home.cleanup();
});

test('a short turn sends nothing, so the allowance is not burned', async () => {
  config({});
  await fire('claude-code', claude('UserPromptSubmit'));
  await fire('claude-code', claude('Stop'));
  assert.equal(api.sends().length, 0);
});

test('a long turn texts once, naming the agent and folder', async () => {
  config({});
  await fire('claude-code', claude('UserPromptSubmit'));
  backdate(12);
  const result = await fire('claude-code', claude('Stop'));
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(api.sends().length, 1);
  assert.equal(api.sends()[0].body.message, 'Claude Code finished in my-repo after 12 min.');
  await fire('claude-code', claude('Stop'));
  assert.equal(api.sends().length, 1);
});

test('the threshold comes from config', async () => {
  config({ hookMinMinutes: 30 });
  await fire('claude-code', claude('UserPromptSubmit'));
  backdate(12);
  await fire('claude-code', claude('Stop'));
  assert.equal(api.sends().length, 0);
});

test('stop_hook_active means the turn is not over', async () => {
  config({});
  await fire('claude-code', claude('UserPromptSubmit'));
  backdate(12);
  await fire('claude-code', claude('Stop', { stop_hook_active: true }));
  assert.equal(api.sends().length, 0);
  await fire('claude-code', claude('Stop'));
  assert.equal(api.sends().length, 1);
});

test('waiting texts once per cooldown on long turns only', async () => {
  config({});
  await fire('claude-code', claude('UserPromptSubmit'));
  await fire('claude-code', claude('Notification'));
  assert.equal(api.sends().length, 0);
  backdate(12);
  await fire('claude-code', claude('Notification'));
  await fire('claude-code', claude('Notification'));
  assert.equal(api.sends().length, 1);
  assert.equal(api.sends()[0].body.message, 'Claude Code is waiting on you in my-repo.');
});

test('Codex uses the same flow with its own approval event', async () => {
  config({});
  const codex = (event) => ({ session_id: 'c1', cwd: '/work/repo', hook_event_name: event, turn_id: 't1' });
  await fire('codex', codex('UserPromptSubmit'));
  backdate(6);
  await fire('codex', codex('PermissionRequest'));
  const stop = await fire('codex', codex('Stop'));
  assert.equal(stop.stdout, '');
  assert.deepEqual(api.sends().map((c) => c.body.message), ['Codex is waiting on you in repo.', 'Codex finished in repo after 6 min.']);
});

test('Cursor reports errors, ignores aborts and answers continue', async () => {
  config({});
  const cursor = (event, extra = {}) => ({ conversation_id: 'x1', workspace_roots: ['/work/app'], hook_event_name: event, ...extra });
  const before = await fire('cursor', cursor('beforeSubmitPrompt', { prompt: 'go' }));
  assert.equal(JSON.parse(before.stdout).continue, true);
  backdate(6);
  await fire('cursor', cursor('stop', { status: 'aborted' }));
  assert.equal(api.sends().length, 0);
  await fire('cursor', cursor('beforeSubmitPrompt', { prompt: 'go' }));
  backdate(6);
  await fire('cursor', cursor('stop', { status: 'error' }));
  assert.equal(api.sends()[0].body.message, 'Cursor stopped with an error in app after 6 min.');
});

test('it never fails the agent: bad input, no key and no network all exit 0', async () => {
  assert.equal((await fire('claude-code', 'not json')).code, 0);
  assert.equal((await fire('nonsense-agent', claude('Stop'))).code, 0);
  config({ apiKey: '' });
  await fire('claude-code', claude('UserPromptSubmit'));
  backdate(12);
  assert.equal((await fire('claude-code', claude('Stop'))).code, 0);
  config({});
  await fire('claude-code', claude('UserPromptSubmit'));
  backdate(12);
  await api.close();
  assert.equal((await fire('claude-code', claude('Stop'))).code, 0);
  api = await mockApi();
});

test('it texts only the fixed endpoint, with the agent text left out', async () => {
  config({});
  await fire('claude-code', claude('UserPromptSubmit', { prompt: 'secret prompt' }));
  backdate(12);
  await fire('claude-code', claude('Stop', { last_assistant_message: 'secret reply' }));
  assert.doesNotMatch(JSON.stringify(api.sends()[0].body), /secret/);
  assert.equal('to' in api.sends()[0].body, false);
});

const settingsFile = () => path.join(home.home, '.claude', 'settings.json');

test('install keeps existing settings and hooks, and is repeatable', async () => {
  config({});
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  const existing = {
    model: 'opus',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-own-script' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard' }] }] }
  };
  fs.writeFileSync(settingsFile(), JSON.stringify(existing));
  assert.equal((await cli(['hook', 'install', 'claude-code', '--after', '10'])).code, 0);
  await cli(['hook', 'install', 'claude-code']);
  const after = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  assert.equal(after.model, 'opus');
  assert.equal(after.hooks.Stop.length, 2);
  assert.equal(after.hooks.UserPromptSubmit.length, 1);
  assert.deepEqual(after.hooks.PreToolUse, existing.hooks.PreToolUse);
  assert.equal(after.hooks.Notification[0].matcher, 'permission_prompt|elicitation_dialog');
  assert.equal(fs.existsSync(path.join(home.configDir, 'hook.js')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home.configDir, 'config.json'), 'utf8')).hookMinMinutes, 10);

  assert.equal((await cli(['hook', 'uninstall', 'claude-code'])).code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')), existing);
});

test('install refuses to touch a settings file it cannot parse', async () => {
  config({});
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), '{ broken');
  const result = await cli(['hook', 'install', 'claude-code']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /left unchanged/);
  assert.equal(fs.readFileSync(settingsFile(), 'utf8'), '{ broken');
});

test('Codex and Cursor files get their own shapes, and the copied hook runs', async () => {
  config({});
  await cli(['hook', 'install', 'codex']);
  await cli(['hook', 'install', 'cursor']);
  const codex = JSON.parse(fs.readFileSync(path.join(home.home, '.codex', 'hooks.json'), 'utf8'));
  assert.equal(codex.hooks.PermissionRequest[0].hooks[0].type, 'command');
  const cursor = JSON.parse(fs.readFileSync(path.join(home.home, '.cursor', 'hooks.json'), 'utf8'));
  assert.equal(cursor.version, 1);
  assert.match(cursor.hooks.stop[0].command, /hook\.js" cursor$/);

  const copied = path.join(home.configDir, 'hook.js');
  await fire('codex', { session_id: 'c', cwd: '/w/r', hook_event_name: 'UserPromptSubmit' }, copied);
  backdate(6);
  await fire('codex', { session_id: 'c', cwd: '/w/r', hook_event_name: 'Stop' }, copied);
  assert.equal(api.sends().length, 1);
});
