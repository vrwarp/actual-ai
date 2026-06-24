// Tighten default file permissions for anything the app creates (config/secrets)
// before any module that might write to disk is imported. Best-effort; gated on the
// Web UI being enabled so normal deployments are unaffected.
if (process.env.WEB_UI_ENABLED === 'true') {
  try { process.umask(0o077); } catch { /* not fatal */ }
}

// eslint-disable-next-line import/first
import cron from 'node-cron';
// eslint-disable-next-line import/first
import {
  cronSchedule, isFeatureEnabled, webUiEnabled, mockMode,
} from './src/config';
// eslint-disable-next-line import/first
import { isSubMinuteCron } from './src/web/validate';

/**
 * Main application entry point.
 *
 * Sets up the cron schedule, optionally triggers an immediate classification, and
 * optionally starts the companion Web UI (config editor + debug interface). The
 * server is additive: if the service graph fails to build (e.g. bad config), the
 * UI still starts so the user can fix things and restart.
 */
(async () => {
  process.on('unhandledRejection', (e) => console.error('unhandledRejection:', String(e)));
  process.on('uncaughtException', (e) => console.error('uncaughtException:', String(e)));

  let actualAi: { classify: () => Promise<void> } | undefined;
  let bootError: unknown;
  try {
    actualAi = (await import('./src/container')).default;
  } catch (e) {
    bootError = e;
    console.error('Service graph failed to build — fix config in the Web UI and restart:', String(e));
  }

  const scheduleValid = cron.validate(cronSchedule);
  const scheduleOk = scheduleValid && !isSubMinuteCron(cronSchedule);

  if (scheduleValid && !scheduleOk) {
    console.error('Refusing sub-minute / 6-field cron schedule:', cronSchedule);
  }

  if (scheduleOk && actualAi && !mockMode) {
    cron.schedule(cronSchedule, () => {
      actualAi.classify().catch((e) => console.error('Scheduled run failed:', String(e)));
    });
  }

  if (isFeatureEnabled('classifyOnStartup') && actualAi && !mockMode) {
    actualAi.classify().catch((e) => console.error('Startup run failed:', String(e)));
  }

  const runnable = (scheduleOk || isFeatureEnabled('classifyOnStartup')) && !!actualAi;

  console.log('Application started');

  if (webUiEnabled) {
    const { startWebServer } = await import('./src/web/server');
    startWebServer({ bootError, runnable });
    if (mockMode) console.log('[web-ui] MOCK_MODE active — real classification runs are disabled.');
  } else if (mockMode) {
    console.error('MOCK_MODE set without WEB_UI_ENABLED — nothing would run. Exiting.');
    process.exit(1);
  } else if (!runnable) {
    console.error('classifyOnStartup not set or invalid/sub-minute cron schedule:', cronSchedule);
    process.exit(1);
  } else {
    console.log('Application started, waiting for cron schedule:', cronSchedule);
  }
})();
