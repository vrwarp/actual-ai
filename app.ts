import cron from 'node-cron';
import { cronSchedule, isFeatureEnabled } from './src/config';
import actualAi from './src/container';
import { Logger } from './src/utils/log-utils';

/**
 * Main application entry point.
 *
 * This script initializes the application, sets up the cron schedule for periodic execution,
 * and triggers an immediate classification if the 'classifyOnStartup' feature is enabled.
 */

// Validate configuration: Ensure at least one execution method is valid (startup or cron)
if (!isFeatureEnabled('classifyOnStartup') && !cron.validate(cronSchedule)) {
  Logger.error('classifyOnStartup not set or invalid cron schedule:', cronSchedule);
  process.exit(1);
}

// Schedule periodic execution if a valid cron expression is provided
if (cron.validate(cronSchedule)) {
  cron.schedule(cronSchedule, async () => {
    await actualAi.classify();
  });
}

Logger.info('Application started');

// Trigger immediate execution if enabled
if (isFeatureEnabled('classifyOnStartup')) {
  (async () => {
    await actualAi.classify();
  })();
} else {
  Logger.info('Application started, waiting for cron schedule:', cronSchedule);
}
