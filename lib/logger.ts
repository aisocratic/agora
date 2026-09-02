type LogLevel = 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? 'info']

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[REDACTED_EMAIL]')
  if (value instanceof Error) {
    const redacted = new Error(redact(value.message) as string)
    redacted.stack = value.stack
    return redacted
  }
  return value
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) return value
  if (typeof value === 'object' && value !== null) {
    try {
      const str = JSON.stringify(value)
      if (str === '{}') {
        // Plain objects with non-enumerable props (e.g. database client errors)
        const descriptive = Object.getOwnPropertyNames(value)
          .reduce((acc, key) => ({ ...acc, [key]: (value as Record<string, unknown>)[key] }), {} as Record<string, unknown>)
        return Object.keys(descriptive).length > 0 ? descriptive : value
      }
      return value
    } catch { return String(value) }
  }
  return value
}

function emit(level: LogLevel, message: string, ...args: unknown[]) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return

  const isProduction = process.env.NODE_ENV === 'production'
  const safeArgs = (isProduction ? args.map(redact) : args).map(serialize)

  // Use console.warn for errors to avoid Next.js dev overlay intercepting
  // console.error in RSC and surfacing handled errors as unhandled
  const method = level === 'error' && process.env.NODE_ENV !== 'production' ? 'warn' : level
  console[method](`[${level.toUpperCase()}]`, message, ...safeArgs)
}

export const logger = {
  info: (message: string, ...args: unknown[]) => emit('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => emit('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => emit('error', message, ...args),
}
