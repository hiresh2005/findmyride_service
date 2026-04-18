import { createLogger, format, transports } from 'winston';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '..', '..', 'logs');

// Ensure logs directory exists at startup
mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${stack ?? message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Console — colourised
    new transports.Console({
      format: combine(
        colorize(),
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
    // Persistent file logs
    new transports.File({
      filename: join(logsDir, 'error.log'),
      level: 'error',
    }),
    new transports.File({
      filename: join(logsDir, 'combined.log'),
    }),
  ],
});

export default logger;
