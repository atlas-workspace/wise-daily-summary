const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel);
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(msg: string, data?: unknown) {
    if (shouldLog('debug')) console.debug(`[${timestamp()}] DEBUG ${msg}`, data ?? '');
  },
  info(msg: string, data?: unknown) {
    if (shouldLog('info')) console.info(`[${timestamp()}] INFO  ${msg}`, data ?? '');
  },
  warn(msg: string, data?: unknown) {
    if (shouldLog('warn')) console.warn(`[${timestamp()}] WARN  ${msg}`, data ?? '');
  },
  error(msg: string, data?: unknown) {
    if (shouldLog('error')) console.error(`[${timestamp()}] ERROR ${msg}`, data ?? '');
  },
};
