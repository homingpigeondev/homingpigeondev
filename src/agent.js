'use strict';

// Which coding agent is running this, from environment variables the agents set themselves.
// Only the agent's name is ever sent, never a value from the environment. Null if unknown.
const AGENTS = [
  ['claude-code', (env) => env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT],
  ['codex', (env) => env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED || env.CODEX_THREAD_ID || env.CODEX_MANAGED_BY_NPM],
  ['cursor', (env) => env.CURSOR_AGENT || env.CURSOR_TRACE_ID],
  ['gemini-cli', (env) => env.GEMINI_CLI],
  ['opencode', (env) => env.OPENCODE],
  ['github-actions', (env) => env.GITHUB_ACTIONS === 'true']
];

function detectAgent(env = process.env) {
  const found = AGENTS.find(([, test]) => test(env));
  if (found) return found[0];
  const term = String(env.TERM_PROGRAM || '').replace(/[^\w.-]/g, '').slice(0, 30);
  return term ? `terminal:${term}` : null;
}

module.exports = { detectAgent };
