/**
 * Sentry initialization — error tracking & performance monitoring.
 *
 * Set VITE_SENTRY_DSN env var to enable.
 * Disabled in development by default.
 */
import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function initSentry() {
  if (!SENTRY_DSN) {
    console.info('[Sentry] No DSN configured — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    // Performance sampling — 10% of transactions in production
    tracesSampleRate: 0.1,
    // Only send errors (not info/warning)
    beforeSend(event) {
      // Filter out non-error events
      if (event.level && event.level !== 'error' && event.level !== 'fatal') {
        return null;
      }
      return event;
    },
    // Automatically capture unhandled promise rejections
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });

  console.info('[Sentry] Initialized');
}

/**
 * Report an error to Sentry with optional context.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  console.error('[Error]', error);

  if (!SENTRY_DSN) return;

  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: context,
    });
  } else {
    Sentry.captureMessage(String(error), {
      level: 'error',
      extra: context,
    });
  }
}
