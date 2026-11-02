'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// A stand-in API that records requests and mirrors the real server's rules.
async function mockApi() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
      const json = (code, data) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const fail = (code, id, message, next_step) => json(code, { error: { code: id, message, next_step } });

      if (req.url === '/v1/verify') {
        if (!body.code) return json(202, { status: 'code_sent', phone: '***-***-1234', next_step: 'Ask for the code.' });
        if (body.code !== '123456') return fail(401, 'wrong_code', 'That code is wrong or has expired.', 'Ask the user to re-read the code.');
        return json(200, { verified: true, api_key: 'hp_test', phone: '***-***-1234', next_step: 'Store it.' });
      }
      if (req.headers.authorization !== 'Bearer hp_test') return fail(401, 'invalid_api_key', 'This API key is not valid.', 'Get a new key.');
      if (req.url === '/v1/send') {
        if ('to' in body) return fail(400, 'no_to_field', 'Homing Pigeon has no recipient field.', 'Remove the recipient field.');
        return json(202, { id: 'msg_1', status: 'queued', messages_remaining: 49 });
      }
      if (req.url === '/v1/status') {
        return json(200, { verified: true, paused: false, phone: '***-***-1234', messages_remaining: 49, last_send: null });
      }
      return fail(404, 'not_found', 'There is no such endpoint.', 'See the spec.');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    sends: () => calls.filter((c) => c.url === '/v1/send'),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-test-'));
  return {
    home,
    configDir: path.join(home, '.config', 'homingpigeon'),
    cleanup: () => fs.rmSync(home, { recursive: true, force: true })
  };
}

// HOME is set for each child, so these tests can never touch a real agent's settings.
function env(t, api, extra = {}) {
  const clean = { ...process.env };
  delete clean.HOMINGPIGEON_API_KEY;
  delete clean.HOMINGPIGEON_CONFIG_DIR;
  delete clean.XDG_CONFIG_HOME;
  return { ...clean, HOME: t.home, USERPROFILE: t.home, HOMINGPIGEON_API_URL: api ? api.url : 'http://127.0.0.1:9', ...extra };
}

module.exports = { mockApi, tempHome, env };
