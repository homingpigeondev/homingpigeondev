'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_API_URL = 'https://homingpigeon.dev';

function configDir() {
  if (process.env.HOMINGPIGEON_CONFIG_DIR) return process.env.HOMINGPIGEON_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'homingpigeon');
}

const configFile = () => path.join(configDir(), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${configFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, configFile());
  return next;
}

const apiKey = () => process.env.HOMINGPIGEON_API_KEY || readConfig().apiKey || null;
const apiUrl = () => (process.env.HOMINGPIGEON_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

module.exports = { configDir, configFile, readConfig, writeConfig, apiKey, apiUrl };
