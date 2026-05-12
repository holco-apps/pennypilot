import { VERSION } from './version.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.PENNYPILOT_LOG_LEVEL || 'info'] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] < minLevel) return;
  const record = {
    ts: new Date().toISOString(),
    lvl: level,
    app: 'pennypilot',
    v: VERSION,
    msg,
    ...(meta || {}),
  };
  process.stderr.write(JSON.stringify(record) + '\n');
}

export const log = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
