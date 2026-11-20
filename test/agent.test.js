'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { detectAgent } = require('../src/agent');

test('detectAgent names the agent from its own environment variables, and nothing else', () => {
  assert.equal(detectAgent({ CLAUDECODE: '1' }), 'claude-code');
  assert.equal(detectAgent({ CODEX_SANDBOX: 'seatbelt' }), 'codex');
  assert.equal(detectAgent({ CURSOR_TRACE_ID: 'abc' }), 'cursor');
  assert.equal(detectAgent({ GEMINI_CLI: '1' }), 'gemini-cli');
  assert.equal(detectAgent({ GITHUB_ACTIONS: 'true' }), 'github-actions');
  assert.equal(detectAgent({ TERM_PROGRAM: 'vscode' }), 'terminal:vscode');
  assert.equal(detectAgent({ TERM_PROGRAM: 'a b<c>' }), 'terminal:abc');
  assert.equal(detectAgent({}), null);
});
