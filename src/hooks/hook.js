#!/usr/bin/env node
'use strict';

// Runs on agent events. `homingpigeon hook install` copies this file to the config folder,
// so it must stay one file with no dependencies: it runs on every prompt and has to be quick.
//
// Rules:
// - Never fail the agent. Always exit 0, and never write anything to stdout except what the
//   agent's hook protocol asks for.
// - Texts are not free, so only text when the person has probably walked away: a turn counts
//   only if it ran for at least hookMinMinutes.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MIN_MINUTES = 5;
const WAITING_COOLDOWN_MS = 10 * 60 * 1000;
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const AGENTS = {
  'claude-code': { label: 'Claude Code', start: 'UserPromptSubmit', stop: 'Stop', wait: 'Notification' },
  codex: { label: 'Codex', start: 'UserPromptSubmit', stop: 'Stop', wait: 'PermissionRequest' },
  cursor: { label: 'Cursor', start: 'beforeSubmitPrompt', stop: 'stop', wait: null }
};

const configDir = () =>
  process.env.HOMINGPIGEON_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'homingpigeon');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

const stateDir = () => path.join(configDir(), 'hook-state');
const stateFile = (id) =>
  path.join(stateDir(), crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32) + '.json');

function readState(id) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(id), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(id, state) {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(stateFile(id), JSON.stringify(state), { mode: 0o600 });
}

function pruneState() {
  const now = Date.now();
  for (const name of fs.readdirSync(stateDir())) {
    const file = path.join(stateDir(), name);
    if (now - fs.statSync(file).mtimeMs > STATE_MAX_AGE_MS) fs.unlinkSync(file);
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const done = () => resolve(data);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    setTimeout(done, 2000).unref();
  });
}

function placeName(input) {
  const dir = input.cwd || (input.workspace_roots && input.workspace_roots[0]) || '';
  return path.basename(String(dir)).replace(/[^\w .-]/g, '').slice(0, 40);
}

function duration(ms) {
  const minutes = Math.round(ms / 60000);
  return minutes >= 1 ? ` after ${minutes} min` : '';
}

async function text(message, idempotencyKey, config) {
  const key = process.env.HOMINGPIGEON_API_KEY || config.apiKey;
  if (!key) return;
  const url = (process.env.HOMINGPIGEON_API_URL || 'https://homingpigeon.dev').replace(/\/+$/, '');
  await fetch(`${url}/v1/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': 'homingpigeondev-hook'
    },
    body: JSON.stringify({ message, idempotency_key: idempotencyKey }),
    signal: AbortSignal.timeout(5000)
  });
}

async function run(agentName, input) {
  const agent = AGENTS[agentName];
  const id = input.session_id || input.conversation_id;
  if (!agent || !id) return;
  const event = input.hook_event_name;
  const state = readState(id);
  const config = readConfig();
  const minMs = Number(config.hookMinMinutes ?? DEFAULT_MIN_MINUTES) * 60000;
  const where = placeName(input);
  const suffix = where ? ` in ${where}` : '';
  const now = Date.now();

  if (event === agent.start) {
    writeState(id, { ...state, startedAt: now });
    pruneState();
    return;
  }
  if (!state.startedAt) return;
  const elapsed = now - state.startedAt;

  if (event === agent.stop) {
    if (input.stop_hook_active) return; // another hook is keeping the turn going
    writeState(id, { ...state, startedAt: null });
    if (input.status === 'aborted') return; // the person stopped it, so they are there
    if (elapsed < minMs) return;
    const outcome = input.status === 'error' ? 'stopped with an error' : 'finished';
    await text(`${agent.label} ${outcome}${suffix}${duration(elapsed)}.`, `hook-${id}-${state.startedAt}`, config);
    return;
  }

  if (event === agent.wait) {
    if (elapsed < minMs || now - (state.waitingAt || 0) < WAITING_COOLDOWN_MS) return;
    writeState(id, { ...state, waitingAt: now });
    await text(`${agent.label} is waiting on you${suffix}.`, `hook-wait-${id}-${now}`, config);
  }
}

if (require.main === module) {
  const agentName = process.argv[2];
  readStdin()
    .then((raw) => run(agentName, JSON.parse(raw || '{}')))
    .catch(() => {})
    .finally(() => {
      if (agentName === 'cursor') {
        // Cursor reads this reply on beforeSubmitPrompt and ignores it elsewhere.
        process.stdout.write('{"continue":true}\n', () => process.exit(0));
      } else {
        process.exit(0);
      }
    });
}
