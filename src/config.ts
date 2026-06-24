import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseRateLimitEnv } from './utils/parse-rate-limit-env';
import { maybeApplyOverlay } from './web/config-store';

// Resolve the bundled default prompt relative to this module so it works whether
// running from source (ts-node) or compiled (dist/). Falls back to a tiny template
// rather than crashing the whole process if the asset is missing.
function readDefaultPrompt(): string {
  const candidates = [
    path.join(__dirname, 'templates', 'prompt.hbs'),
    path.join(process.cwd(), 'src', 'templates', 'prompt.hbs'),
  ];
  const found = candidates.reduce<string | null>((acc, p) => {
    if (acc !== null) return acc;
    try {
      return fs.readFileSync(p, 'utf8').trim();
    } catch {
      return null;
    }
  }, null);
  if (found !== null) return found;
  console.warn('Could not read default prompt template from', candidates.join(' or '));
  return 'Categorize this transaction:\n{{amount}} {{type}} {{payee}} {{description}}';
}

const defaultPromptTemplate = readDefaultPrompt();

dotenv.config();

// Layer any Web-UI overlay onto process.env BEFORE the constants below are
// evaluated. No-op (and touches no filesystem) unless WEB_UI_ENABLED=true.
maybeApplyOverlay();

export const serverURL = process.env.ACTUAL_SERVER_URL ?? '';
export const password = process.env.ACTUAL_PASSWORD ?? '';
export const budgetId = process.env.ACTUAL_BUDGET_ID ?? '';
export const e2ePassword = process.env.ACTUAL_E2E_PASSWORD ?? '';
export const cronSchedule = process.env.CLASSIFICATION_SCHEDULE_CRON ?? '';
export const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? '';
export const llmProvider = process.env.LLM_PROVIDER ?? (openrouterApiKey ? 'openrouter' : 'openai');
export const openaiBaseURL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
export const openaiApiKey = process.env.OPENAI_API_KEY ?? '';
export const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
export const openrouterBaseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
export const openrouterModel = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v3.2';
export const openrouterReferrer = process.env.OPENROUTER_REFERRER ?? process.env.OPENROUTER_REFERER ?? '';
export const openrouterTitle = process.env.OPENROUTER_TITLE ?? 'actual-ai';
const parsedLlmTimeoutMs = Number.parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10);
export const llmTimeoutMs = Number.isFinite(parsedLlmTimeoutMs) && parsedLlmTimeoutMs > 0
  ? parsedLlmTimeoutMs
  : 120_000;
export const openrouterEnableToolCalling = process.env.OPENROUTER_ENABLE_TOOL_CALLING === 'true';
export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
export const anthropicBaseURL = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
export const anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
export const googleModel = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? process.env.GOOGLE_GENERATIVE_MODEL ?? 'gemini-1.5-flash';
export const googleBaseURL = process.env.GOOGLE_GENERATIVE_AI_BASE_URL ?? process.env.GOOGLE_GENERATIVE_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
export const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
export const ollamaBaseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
export const ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3.1';
export const dataDir = '/tmp/actual-ai/';
export const promptTemplate = process.env.PROMPT_TEMPLATE ?? defaultPromptTemplate;
export const notGuessedTag = process.env.NOT_GUESSED_TAG ?? '#actual-ai-miss';
export const manualOverrideTag = process.env.MANUAL_OVERRIDE_TAG ?? '#actual-ai-override';
export const guessedTag = process.env.GUESSED_TAG ?? '#actual-ai';
export const groqApiKey = process.env.GROQ_API_KEY ?? '';
export const groqModel = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
export const groqBaseURL = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
export const valueSerpApiKey = process.env.VALUESERP_API_KEY ?? '';
export const batchDelayMs = parseInt(process.env.BATCH_DELAY_MS ?? '2000', 10);
export const batchSize = parseInt(process.env.BATCH_SIZE ?? '20', 10);

// Optional per-deployment overrides for LLM rate limits.
// `null` → use provider default; `0` → disable that axis; `>0` → custom limit.
export const requestsPerMinuteOverride = parseRateLimitEnv(
  process.env.REQUESTS_PER_MINUTE,
  'REQUESTS_PER_MINUTE',
);
export const tokensPerMinuteOverride = parseRateLimitEnv(
  process.env.TOKENS_PER_MINUTE,
  'TOKENS_PER_MINUTE',
);

/**
 * Interface representing a feature flag configuration.
 */
export interface FeatureFlag {
  /** Indicates if the feature is currently enabled. */
  enabled: boolean;
  /** The default value for the feature if not explicitly configured. */
  defaultValue: boolean;
  /** A human-readable description of what the feature does. */
  description: string;
  /** Optional list of related options or sub-features. */
  options?: string[];
}

/**
 * Type definition for a collection of feature flags.
 */
export type FeatureFlags = Record<string, FeatureFlag>;

export const features: FeatureFlags = {};

let enabledFeatures: string[] = [];
try {
  if (process.env.FEATURES) {
    const parsedFeatures = JSON.parse(process.env.FEATURES) as unknown;
    if (Array.isArray(parsedFeatures)) {
      enabledFeatures = parsedFeatures as string[];
    } else {
      console.warn('FEATURES environment variable is not a valid JSON array, ignoring');
    }
  } else if (process.env.ENABLED_FEATURES) {
    const raw = process.env.ENABLED_FEATURES.trim();
    if (raw.startsWith('[')) {
      const parsedFeatures = JSON.parse(raw) as unknown;
      if (Array.isArray(parsedFeatures)) {
        enabledFeatures = parsedFeatures as string[];
      } else {
        console.warn('ENABLED_FEATURES must be a comma list or JSON array, ignoring');
      }
    } else {
      enabledFeatures = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
} catch (e) {
  console.warn('Failed to parse FEATURES/ENABLED_FEATURES environment variable, ignoring', e);
}

/**
 * Registers standard built-in features with the feature flag system.
 */
function registerStandardFeatures() {
  features.suggestNewCategories = {
    enabled: enabledFeatures.includes('suggestNewCategories'),
    defaultValue: false,
    description: 'Suggest new categories for transactions that cannot be classified',
  };

  features.dryRun = {
    enabled: enabledFeatures.includes('dryRun'),
    defaultValue: true,
    description: 'Run in dry mode without actually making changes',
  };

  features.rerunMissedTransactions = {
    enabled: enabledFeatures.includes('rerunMissedTransactions'),
    defaultValue: false,
    description: 'Re-process transactions marked as not guessed',
  };

  features.classifyOnStartup = {
    enabled: enabledFeatures.includes('classifyOnStartup') || process.env.CLASSIFY_ON_STARTUP === 'true',
    defaultValue: false,
    description: 'Run classification when the application starts',
  };

  features.syncAccountsBeforeClassify = {
    enabled: enabledFeatures.includes('syncAccountsBeforeClassify') || process.env.SYNC_ACCOUNTS_BEFORE_CLASSIFY === 'true',
    defaultValue: false,
    description: 'Sync accounts before running classification',
  };

  features.disableRateLimiter = {
    enabled: enabledFeatures.includes('disableRateLimiter'),
    defaultValue: false,
    description: 'Disable Rate Limiter',
  };

  features.disableMasking = {
    enabled: enabledFeatures.includes('disableMasking') || process.env.DISABLE_LOG_MASKING === 'true',
    defaultValue: false,
    description: 'Disable masking of sensitive information in logs',
  };
}

/**
 * Registers tool-related features with the feature flag system.
 * Handles legacy environment variable configuration.
 */
function registerToolFeatures() {
  const legacyTools = (process.env.ENABLED_TOOLS ?? '').split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);

  features.webSearch = {
    enabled: enabledFeatures.includes('webSearch') || legacyTools.includes('webSearch'),
    defaultValue: false,
    description: 'Enable web search capability for merchant lookup',
    options: ['webSearch'],
  };

  features.freeWebSearch = {
    enabled: enabledFeatures.includes('freeWebSearch') || legacyTools.includes('freeWebSearch'),
    defaultValue: false,
    description: 'Enable free web search capability for merchant lookup (self-hosted alternative to ValueSerp)',
    options: ['freeWebSearch'],
  };

  // Additional tools can be added here following the same pattern
  // features.newTool = {
  //   enabled: enabledFeatures.includes('newTool'),
  //   defaultValue: false,
  //   description: '...'
  // };
}

registerStandardFeatures();
registerToolFeatures();

/**
 * Checks if a specific feature is enabled.
 *
 * @param featureName - The name of the feature to check.
 * @returns True if the feature is enabled, false otherwise.
 */
export function isFeatureEnabled(featureName: string): boolean {
  return features[featureName]?.enabled ?? features[featureName]?.defaultValue ?? false;
}

/**
 * Registers a custom feature flag dynamically.
 *
 * @param name - The unique identifier for the feature.
 * @param enabled - Whether the feature is enabled by default.
 * @param defaultValue - The default value to fallback to.
 * @param description - A description of the feature.
 * @param options - Optional additional configuration options.
 */
export function registerCustomFeatureFlag(
  name: string,
  enabled: boolean,
  defaultValue: boolean,
  description: string,
  options?: string[],
): void {
  features[name] = {
    enabled,
    defaultValue,
    description,
    options,
  };
}

/**
 * Toggles a feature on or off.
 *
 * @param featureName - The name of the feature to toggle.
 * @param enabled - Optional boolean to force a specific state (true/false).
 *   If omitted, toggles the current state.
 * @returns The new state of the feature (true if enabled, false if disabled).
 *   Returns false if the feature does not exist.
 */
export function toggleFeature(featureName: string, enabled?: boolean): boolean {
  if (!features[featureName]) {
    console.warn(`Feature flag '${featureName}' does not exist`);
    return false;
  }
  const newValue = enabled ?? !features[featureName].enabled;
  features[featureName].enabled = newValue;
  return newValue;
}

/**
 * Retrieves a list of all enabled tools.
 *
 * @returns An array of strings representing the names of enabled tools.
 */
export function getEnabledTools(): string[] {
  return Object.entries(features)
    .filter(([_, config]) => config.options && isFeatureEnabled(config.options[0]))
    .flatMap(([_, config]) => config.options ?? []);
}

/**
 * Checks if a specific tool is enabled.
 *
 * @param toolName - The name of the tool to check.
 * @returns True if the tool is enabled, false otherwise.
 */
export function isToolEnabled(toolName: string): boolean {
  return getEnabledTools().includes(toolName);
}

// ---------------------------------------------------------------------------
// Web UI companion server settings (bootstrap-only; never editable via the UI).
// ---------------------------------------------------------------------------
export const webUiEnabled = process.env.WEB_UI_ENABLED === 'true';
export const webUiPort = (() => {
  const p = Number.parseInt(process.env.WEB_UI_PORT ?? '', 10);
  return Number.isFinite(p) && p > 0 ? p : 3001;
})();
export const webUiBindAddress = process.env.WEB_UI_BIND_ADDRESS ?? '127.0.0.1';
export const mockMode = process.env.MOCK_MODE === 'true';

// ---------------------------------------------------------------------------
// Resolved configuration object + pure resolver.
// `resolveConfig` lets the Web UI compute what a PENDING overlay would produce
// (for the dry-run preview) without mutating the live process.
// ---------------------------------------------------------------------------

/** Feature-flag snapshot threaded into services. */
export interface ResolvedFlags {
  dryRun: boolean;
  disableRateLimiter: boolean;
  suggestNewCategories: boolean;
  rerunMissedTransactions: boolean;
  syncAccountsBeforeClassify: boolean;
}

/** Everything `buildContainer` needs to wire the graph. */
export interface ResolvedConfig {
  llmProvider: string;
  openaiApiKey: string; openaiModel: string; openaiBaseURL: string;
  openrouterApiKey: string; openrouterModel: string; openrouterBaseURL: string;
  openrouterReferrer: string; openrouterTitle: string; openrouterEnableToolCalling: boolean;
  anthropicApiKey: string; anthropicModel: string; anthropicBaseURL: string;
  googleApiKey: string; googleModel: string; googleBaseURL: string;
  ollamaModel: string; ollamaBaseURL: string;
  groqApiKey: string; groqModel: string; groqBaseURL: string;
  serverURL: string; password: string; budgetId: string; e2ePassword: string;
  dataDir: string;
  notGuessedTag: string; guessedTag: string; manualOverrideTag: string;
  promptTemplate: string;
  batchSize: number; batchDelayMs: number; llmTimeoutMs: number;
  valueSerpApiKey: string;
  requestsPerMinuteOverride: number | null;
  tokensPerMinuteOverride: number | null;
  enabledTools: string[];
  flags: ResolvedFlags;
}

function flagsFor(enabled: string[], env: Record<string, string | undefined>): ResolvedFlags {
  const has = (name: string) => enabled.includes(name);
  return {
    dryRun: has('dryRun'),
    disableRateLimiter: has('disableRateLimiter'),
    suggestNewCategories: has('suggestNewCategories'),
    rerunMissedTransactions: has('rerunMissedTransactions'),
    syncAccountsBeforeClassify: has('syncAccountsBeforeClassify') || env.SYNC_ACCOUNTS_BEFORE_CLASSIFY === 'true',
  };
}

function parseEnabledFeatures(env: Record<string, string | undefined>): string[] {
  let list: string[] = [];
  try {
    if (env.FEATURES) {
      const parsed = JSON.parse(env.FEATURES) as unknown;
      if (Array.isArray(parsed)) list = parsed as string[];
    } else if (env.ENABLED_FEATURES) {
      const raw = env.ENABLED_FEATURES.trim();
      if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) list = parsed as string[];
      } else {
        list = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  } catch {
    list = [];
  }
  const legacyTools = (env.ENABLED_TOOLS ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  return [...new Set([...list, ...legacyTools])];
}

/** Pure resolver over an arbitrary env map. */
export function resolveConfig(env: Record<string, string | undefined>): ResolvedConfig {
  const orApiKey = env.OPENROUTER_API_KEY ?? '';
  const parsedTimeout = Number.parseInt(env.LLM_TIMEOUT_MS ?? '', 10);
  const enabled = parseEnabledFeatures(env);
  const enabledTools = ['webSearch', 'freeWebSearch'].filter((t) => enabled.includes(t));
  return {
    llmProvider: env.LLM_PROVIDER ?? (orApiKey ? 'openrouter' : 'openai'),
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    openaiModel: env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    openaiBaseURL: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    openrouterApiKey: orApiKey,
    openrouterModel: env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v3.2',
    openrouterBaseURL: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    openrouterReferrer: env.OPENROUTER_REFERRER ?? env.OPENROUTER_REFERER ?? '',
    openrouterTitle: env.OPENROUTER_TITLE ?? 'actual-ai',
    openrouterEnableToolCalling: env.OPENROUTER_ENABLE_TOOL_CALLING === 'true',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
    anthropicBaseURL: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
    googleModel: env.GOOGLE_GENERATIVE_AI_MODEL ?? env.GOOGLE_GENERATIVE_MODEL ?? 'gemini-1.5-flash',
    googleBaseURL: env.GOOGLE_GENERATIVE_AI_BASE_URL ?? env.GOOGLE_GENERATIVE_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
    ollamaModel: env.OLLAMA_MODEL ?? 'llama3.1',
    ollamaBaseURL: env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
    groqApiKey: env.GROQ_API_KEY ?? '',
    groqModel: env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    groqBaseURL: env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    serverURL: env.ACTUAL_SERVER_URL ?? '',
    password: env.ACTUAL_PASSWORD ?? '',
    budgetId: env.ACTUAL_BUDGET_ID ?? '',
    e2ePassword: env.ACTUAL_E2E_PASSWORD ?? '',
    dataDir,
    notGuessedTag: env.NOT_GUESSED_TAG ?? '#actual-ai-miss',
    guessedTag: env.GUESSED_TAG ?? '#actual-ai',
    manualOverrideTag: env.MANUAL_OVERRIDE_TAG ?? '#actual-ai-override',
    promptTemplate: env.PROMPT_TEMPLATE ?? defaultPromptTemplate,
    batchSize: parseInt(env.BATCH_SIZE ?? '20', 10),
    batchDelayMs: parseInt(env.BATCH_DELAY_MS ?? '2000', 10),
    llmTimeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 120_000,
    valueSerpApiKey: env.VALUESERP_API_KEY ?? '',
    requestsPerMinuteOverride: parseRateLimitEnv(env.REQUESTS_PER_MINUTE, 'REQUESTS_PER_MINUTE'),
    tokensPerMinuteOverride: parseRateLimitEnv(env.TOKENS_PER_MINUTE, 'TOKENS_PER_MINUTE'),
    enabledTools,
    flags: flagsFor(enabled, env),
  };
}

/** Live feature-flag snapshot from the global flag registry. */
export function liveFlags(): ResolvedFlags {
  return {
    dryRun: isFeatureEnabled('dryRun'),
    disableRateLimiter: isFeatureEnabled('disableRateLimiter'),
    suggestNewCategories: isFeatureEnabled('suggestNewCategories'),
    rerunMissedTransactions: isFeatureEnabled('rerunMissedTransactions'),
    syncAccountsBeforeClassify: isFeatureEnabled('syncAccountsBeforeClassify'),
  };
}
