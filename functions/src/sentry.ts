import { randomUUID } from 'crypto';

interface SentryConfig {
  protocol: string;
  host: string;
  projectId: string;
  publicKey: string;
}

interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  userId?: string;
}

const rawDsn = process.env.SENTRY_DSN;
const sentryEnvironment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const sentryClient = 'skatehubba-functions/1.0.0';

function parseDsn(dsn?: string): SentryConfig | null {
  if (!dsn) {
    return null;
  }
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '').trim();
    if (!projectId) {
      return null;
    }
    return {
      protocol: url.protocol,
      host: url.host,
      projectId,
      publicKey: url.username,
    };
  } catch (error) {
    console.error('Invalid Sentry DSN', error);
    return null;
  }
}

const config = parseDsn(rawDsn);

function buildAuthHeader(publicKey: string): string {
  return `Sentry sentry_version=7, sentry_client=${sentryClient}, sentry_key=${publicKey}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name,
      value: error.message,
      stacktrace: error.stack
        ? {
            frames: error.stack
              .split('\n')
              .slice(1)
              .map((line) => ({
                filename: line.trim(),
              })),
          }
        : undefined,
    };
  }
  return {
    type: typeof error,
    value: JSON.stringify(error),
  };
}

export async function captureException(error: unknown, context: CaptureContext = {}) {
  if (!config) {
    return;
  }

  try {
    const eventId = randomUUID().replace(/-/g, '');
    const body = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      level: 'error',
      platform: 'node',
      environment: sentryEnvironment,
      exception: {
        values: [serializeError(error)],
      },
      tags: context.tags ?? {},
      extra: context.extra ?? {},
      user: context.userId ? { id: context.userId } : undefined,
    };

    const endpoint = `${config.protocol}//${config.host}/api/${config.projectId}/store/`;
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': buildAuthHeader(config.publicKey),
      },
      body: JSON.stringify(body),
    });
  } catch (sendError) {
    console.error('Failed to report error to Sentry', sendError);
  }
}

export async function flush(timeoutMs = 2000) {
  await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 500)));
}
