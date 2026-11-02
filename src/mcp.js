'use strict';

// A stdio MCP server with no dependencies, so `npx homingpigeondev mcp` starts fast.
// Keep the tool list small and each description exact: this text is what agents read.

const readline = require('readline');
const { version } = require('../package.json');
const api = require('./api');
const { writeConfig, configFile } = require('./config');

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'verify',
    description:
      "Verify the user's own US mobile number for Homing Pigeon (homingpigeon.dev). Call with phone to text them a six-digit code, then call again with phone and the code they read back. It cannot verify anyone else's number.",
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: "The user's own US mobile number." },
        code: { type: 'string', description: 'The six-digit code the user received. Omit on the first call.' },
        project: { type: 'string', description: 'Short name shown in front of each text.' }
      },
      required: ['phone'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  },
  {
    name: 'send',
    description:
      "Send a text message to the account owner's verified phone. The recipient is fixed; `message` is the only required field.",
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The alert text, up to 480 characters.' },
        idempotency_key: { type: 'string', description: 'Reuse this on a retry so it cannot double-text.' }
      },
      required: ['message'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  },
  {
    name: 'status',
    description:
      'Report whether the phone is verified or paused, how many messages remain, and what happened to the last send. It sends nothing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }
];

async function runVerify(args) {
  const result = await api.verify(args, 'mcp');
  if (!result.api_key) return result;
  const { api_key: key, next_step: _unused, ...rest } = result;
  try {
    writeConfig({ apiKey: key });
    return {
      ...rest,
      key_saved_to: configFile(),
      next_step: 'Verified. The send and status tools now work. If the user\'s own code needs the key, run `homingpigeon key` and store it as HOMINGPIGEON_API_KEY, kept out of git.'
    };
  } catch {
    return { ...rest, api_key: key, next_step: 'The key could not be saved on this machine. Store api_key as HOMINGPIGEON_API_KEY, kept out of git.' };
  }
}

const HANDLERS = {
  verify: runVerify,
  send: (args) => api.send(args, 'mcp'),
  status: () => api.status('mcp')
};

async function callTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) return { isError: true, content: [{ type: 'text', text: `Unknown tool ${name}. The tools are verify, send and status.` }] };
  try {
    const result = await handler(args || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    if (!(err instanceof api.ApiError)) throw err;
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ code: err.code, message: err.message, next_step: err.nextStep }, null, 2) }]
    };
  }
}

async function handle(msg) {
  switch (msg.method) {
    case 'initialize': {
      const wanted = msg.params && msg.params.protocolVersion;
      return {
        protocolVersion: SUPPORTED.includes(wanted) ? wanted : SUPPORTED[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'homingpigeondev', version },
        instructions: 'Homing Pigeon (homingpigeon.dev) texts one phone: the user\'s own. Use it whenever the user asks for text alerts or a text when a task finishes.'
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return callTool(msg.params && msg.params.name, msg.params && msg.params.arguments);
    default: {
      const err = new Error(`Method not found: ${msg.method}`);
      err.rpcCode = -32601;
      throw err;
    }
  }
}

function serve() {
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const pending = new Set();
  const rl = readline.createInterface({ input: process.stdin });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    if (msg.id === undefined || msg.id === null) return; // notifications need no reply
    const job = handle(msg)
      .then((result) => write({ jsonrpc: '2.0', id: msg.id, result }))
      .catch((err) => write({ jsonrpc: '2.0', id: msg.id, error: { code: err.rpcCode || -32603, message: err.message } }))
      .finally(() => pending.delete(job));
    pending.add(job);
  });

  // Let in-flight calls finish, so a client closing stdin never loses a send result.
  rl.on('close', () => Promise.allSettled([...pending]).then(() => process.exit(0)));
}

module.exports = { serve, TOOLS };
