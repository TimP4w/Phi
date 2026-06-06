const isProd = import.meta.env.PROD;

const logger = {
  debug: (...args: unknown[]) => { if (!isProd) console.log(...args); },
  log: (...args: unknown[]) => { if (!isProd) console.log(...args); },
  warn: (...args: unknown[]) => { if (!isProd) console.warn(...args); },
  error: (...args: unknown[]) => console.error(...args),
};

export default logger;
