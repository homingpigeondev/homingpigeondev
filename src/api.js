'use strict';

const { version } = require('../package.json');
const { apiKey, apiUrl } = require('./config');

class ApiError extends Error {
  constructor(code, message, nextStep, status) {
    super(message);
    this.code = code;
    this.nextStep = nextStep;
    this.status = status;
  }
}

const NO_KEY = () =>
  new ApiError(
    'key_not_verified',
    'No Homing Pigeon key was found on this machine.',
    "Verify the user's own phone first: call verify with their number, then again with the six-digit code they receive."
  );

async function request(method, route, { body, auth = false, surface = 'cli' } = {}) {
  const headers = { 'User-Agent': `homingpigeondev/${version} (${surface})` };
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const key = apiKey();
    if (!key) throw NO_KEY();
    headers.Authorization = `Bearer ${key}`;
  }

  let res;
  try {
    res = await fetch(`${apiUrl()}${route}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new ApiError('network_error', 'Could not reach Homing Pigeon.', 'Check the connection and try again.');
  }

  const data = await res.json().catch(() => null);
  if (res.ok && data) return data;
  const err = (data && data.error) || {};
  throw new ApiError(
    err.code || 'unexpected_response',
    err.message || `Homing Pigeon returned HTTP ${res.status}.`,
    err.next_step || 'Try again in a minute. If it keeps failing, tell the user.',
    res.status
  );
}

const verify = (input, surface) => request('POST', '/v1/verify', { body: input, surface });
const send = (input, surface) => request('POST', '/v1/send', { body: input, auth: true, surface });
const status = (surface) => request('GET', '/v1/status', { auth: true, surface });

module.exports = { ApiError, verify, send, status };
