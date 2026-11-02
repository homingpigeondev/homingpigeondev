'use strict';

const api = require('./api');
const { writeConfig, readConfig, configFile, apiKey } = require('./config');
const { version } = require('../package.json');

const HELP = `Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours.

Usage:
  homingpigeon verify <phone> [--project name]    Text a six-digit code to your own phone
  homingpigeon verify <phone> <code>              Finish verifying and save the key
  homingpigeon send <message>                     Text yourself (or pipe the message in)
  homingpigeon status                             Show messages left and the last send
  homingpigeon key                                Print the saved key
  homingpigeon hook install <agent> [--after N]   Text you when the agent finishes or waits on you
  homingpigeon hook uninstall <agent>             Remove those hooks
  homingpigeon mcp                                Run the MCP server on stdio

Agents: claude-code, codex, cursor. --after N sets the minutes a turn must run before it texts you (default 5).
Options: --json prints the raw response, --idempotency-key <key> stops a retried send from double-texting.`;

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) positional.push(arg);
    else if (arg === '--json' || arg === '--help' || arg === '--version') flags[arg.slice(2)] = true;
    else {
      flags[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function readPipedInput() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

const print = (flags, data, line) => console.log(flags.json ? JSON.stringify(data, null, 2) : line);

async function verify(positional, flags) {
  const [phone, code] = positional;
  if (!phone) throw new api.ApiError('invalid_phone', 'A phone number is required.', 'Run: homingpigeon verify +15551234567');
  const result = await api.verify({ phone, code, project: flags.project });
  if (!result.api_key) {
    return print(flags, result, `Code sent to ${result.phone}. Then run: homingpigeon verify ${phone} <code>`);
  }
  writeConfig({ apiKey: result.api_key });
  const { api_key: _hidden, ...safe } = result;
  return print(flags, { ...safe, key_saved_to: configFile() }, `Verified ${result.phone}. Key saved to ${configFile()}.\nTry: homingpigeon send "It works."`);
}

async function send(positional, flags) {
  const message = positional.length ? positional.join(' ') : (await readPipedInput()).trim();
  if (!message) throw new api.ApiError('missing_message', 'A message is required.', 'Run: homingpigeon send "Backtest finished."');
  const result = await api.send({ message, idempotency_key: flags['idempotency-key'] });
  print(flags, result, `Sent ${result.id}${result.duplicate ? ' (already sent, not repeated)' : ''}.`);
}

async function status(flags) {
  const s = await api.status();
  const last = s.last_send ? `${s.last_send.status} (${s.last_send.id})` : 'none';
  print(flags, s, `Phone: ${s.phone}${s.paused ? ' (paused: text START to resume)' : ''}\nMessages left: ${s.messages_remaining}\nLast send: ${last}`);
}

function key() {
  const value = apiKey();
  if (!value) throw new api.ApiError('key_not_verified', 'No key is saved here.', 'Run: homingpigeon verify +15551234567');
  console.log(value);
}

function hook(positional, flags) {
  const { install, uninstall } = require('./hooks/install');
  const [action, agent] = positional;
  if (!['install', 'uninstall'].includes(action) || !agent) {
    throw new api.ApiError('invalid_command', 'Usage: homingpigeon hook install|uninstall <agent>', 'Agents: claude-code, codex, cursor.');
  }
  if (action === 'uninstall') {
    const done = uninstall(agent);
    return console.log(`Removed Homing Pigeon hooks from ${done.file}.`);
  }
  if (!apiKey()) {
    throw new api.ApiError('key_not_verified', 'Verify your phone before installing hooks.', 'Run: homingpigeon verify +15551234567');
  }
  if (flags.after !== undefined) {
    const minutes = Number(flags.after);
    if (!Number.isFinite(minutes) || minutes < 0) throw new api.ApiError('invalid_command', '--after must be a number of minutes.', 'Example: --after 10');
    writeConfig({ hookMinMinutes: minutes });
  }
  const done = install(agent);
  const minutes = readConfig().hookMinMinutes ?? 5;
  return console.log(`${done.label} hooks installed in ${done.file}.\nIt texts you when a turn that ran for ${minutes}+ minutes finishes or waits on you.\n${done.after}`);
}

async function main(argv) {
  const { positional, flags } = parse(argv);
  const [command, ...rest] = positional;
  if (flags.version) return console.log(version);
  if (flags.help || !command || command === 'help') return console.log(HELP);
  switch (command) {
    case 'verify': return verify(rest, flags);
    case 'send': return send(rest, flags);
    case 'status': return status(flags);
    case 'key': return key();
    case 'hook': return hook(rest, flags);
    case 'mcp': return require('./mcp').serve();
    default:
      throw new api.ApiError('invalid_command', `Unknown command "${command}".`, 'Run: homingpigeon --help');
  }
}

function fail(err, argv) {
  const known = err instanceof api.ApiError;
  if (argv.includes('--json') && known) {
    console.error(JSON.stringify({ error: { code: err.code, message: err.message, next_step: err.nextStep } }, null, 2));
  } else {
    console.error(err.message);
    if (known && err.nextStep) console.error(err.nextStep);
  }
  process.exitCode = 1;
}

module.exports = { main, fail };
