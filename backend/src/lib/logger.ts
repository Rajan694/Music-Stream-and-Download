export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string, trace?: unknown): void;
  debug(message: string): void;
}

function createLogger(context: string): Logger {
  const prefix = `[${context}]`;
  return {
    log: (message: string) => console.log(`${prefix} ${message}`),
    warn: (message: string) => console.warn(`${prefix} ${message}`),
    error: (message: string, trace?: unknown) =>
      console.error(`${prefix} ${message}`, trace ?? ''),
    debug: (message: string) => console.debug(`${prefix} ${message}`),
  };
}

export const logger = {
  create: createLogger,
};