'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { configDir } = require('../config');

const OURS = /homingpigeon[\\/]hook\.js/;
const isOurs = (hook) => Boolean(hook) && typeof hook.command === 'string' && OURS.test(hook.command);

const TARGETS = {
  'claude-code': {
    label: 'Claude Code',
    file: () => path.join(os.homedir(), '.claude', 'settings.json'),
    events: {
      UserPromptSubmit: {},
      Stop: {},
      Notification: { matcher: 'permission_prompt|elicitation_dialog' }
    },
    nested: true,
    after: 'Start a new Claude Code session for the hooks to take effect.'
  },
  codex: {
    label: 'Codex',
    file: () => path.join(os.homedir(), '.codex', 'hooks.json'),
    events: { UserPromptSubmit: {}, Stop: {}, PermissionRequest: {} },
    nested: true,
    after: 'Codex skips new hooks until they are trusted: run /hooks in Codex and trust the three Homing Pigeon hooks.'
  },
  cursor: {
    label: 'Cursor',
    file: () => path.join(os.homedir(), '.cursor', 'hooks.json'),
    events: { beforeSubmitPrompt: {}, stop: {} },
    nested: false,
    base: { version: 1 },
    after: 'Restart Cursor for the hooks to take effect. Cursor has no event for waiting on approval, so it texts only when the agent finishes.'
  }
};

function target(name) {
  const found = TARGETS[name];
  if (!found) throw new Error(`Unknown agent "${name}". Use one of: ${Object.keys(TARGETS).join(', ')}.`);
  return found;
}

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${file} is not valid JSON, so it was left unchanged. Fix it and run this again.`);
  }
}

// Writes through a temp file, so a crash can never leave someone's settings half-written.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.homingpigeon.bak`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Removes only our hooks and any group they leave empty. Everything else stays as it was.
function strip(json, t) {
  if (!json.hooks) return json;
  for (const event of Object.keys(json.hooks)) {
    const groups = json.hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = groups
      .map((group) => {
        if (t.nested && Array.isArray(group.hooks)) {
          const hooks = group.hooks.filter((h) => !isOurs(h));
          return hooks.length ? { ...group, hooks } : null;
        }
        return isOurs(group) ? null : group;
      })
      .filter(Boolean);
    if (kept.length) json.hooks[event] = kept;
    else delete json.hooks[event];
  }
  if (Object.keys(json.hooks).length === 0) delete json.hooks;
  return json;
}

function hookPath() {
  return path.join(configDir(), 'hook.js');
}

function install(name) {
  const t = target(name);
  const file = t.file();
  const json = strip(readJson(file), t);

  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(__dirname, 'hook.js'), hookPath());
  fs.chmodSync(hookPath(), 0o755);

  const command = `"${process.execPath}" "${hookPath()}" ${name}`;
  const hook = { type: 'command', command, timeout: 10 };
  const next = { ...(t.base || {}), ...json, hooks: json.hooks || {} };
  for (const [event, extra] of Object.entries(t.events)) {
    const entry = t.nested ? { ...extra, hooks: [hook] } : hook;
    next.hooks[event] = [...(next.hooks[event] || []), entry];
  }
  writeJson(file, next);
  return { file, label: t.label, after: t.after };
}

function uninstall(name) {
  const t = target(name);
  const file = t.file();
  if (!fs.existsSync(file)) return { file, label: t.label };
  writeJson(file, strip(readJson(file), t));
  return { file, label: t.label };
}

module.exports = { install, uninstall, TARGETS };
