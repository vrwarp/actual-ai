/**
 * Source of truth for the companion Web UI configuration editor.
 *
 * A single declarative schema drives THREE things:
 *  1. The form rendered by the frontend (`GET /api/config` ships `SECTIONS`).
 *  2. Server-side validation of `PATCH /api/config` (a key not present here is rejected).
 *  3. The allowlist of which env vars the overlay may write.
 *
 * Keep this list in sync with `src/config.ts`. Anything editable by a user lives here;
 * bootstrap-only vars (WEB_UI_*, CONFIG_DIR, MOCK_MODE, dataDir, DISABLE_LOG_MASKING)
 * are deliberately excluded so the UI can never lock itself out or leak its own auth.
 */

export type FieldType =
  | 'text'
  | 'secret'
  | 'url'
  | 'bool'
  | 'select'
  | 'number'
  | 'cron'
  | 'tag'
  | 'rate'
  | 'textarea';

export interface FieldDef {
  /** Canonical config key (matches the `src/config.ts` export name). */
  key: string;
  /** Primary environment variable this maps to. */
  envVar: string;
  /** Additional accepted env var aliases (read-only awareness). */
  aliases?: string[];
  type: FieldType;
  label: string;
  help?: string;
  default?: string;
  /** Secret values are never sent to the client; only `{ set: boolean }`. */
  secret?: boolean;
  required?: boolean;
  /**
   * URL keys where the OS environment wins over the overlay (SSRF surface).
   * When pinned by env, the UI shows a read-only chip.
   */
  pinnable?: boolean;
  /** `[field, [allowedValues]]` — only show/active when another field matches. */
  showWhen?: [string, string[]];
  /** Placeholder / datalist suggestions (non-binding). */
  suggestions?: string[];
  maxLen?: number;
  /**
   * Feature-flag backing. When set, the field is serialized into the single
   * `FEATURES` JSON array rather than its own env var.
   */
  featureFlag?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  fields: FieldDef[];
}

const PROVIDERS = ['openai', 'openrouter', 'anthropic', 'google-generative-ai', 'ollama', 'groq'];

export const SECTIONS: SectionDef[] = [
  {
    id: 'connection',
    title: 'Connection',
    icon: '🔌',
    description: 'How actual-ai reaches your Actual Budget server.',
    fields: [
      {
        key: 'serverURL', envVar: 'ACTUAL_SERVER_URL', type: 'url', label: 'Actual server URL', required: true, pinnable: true, default: 'http://actual_server:5006', help: 'Base URL of your Actual Budget server.',
      },
      {
        key: 'password', envVar: 'ACTUAL_PASSWORD', type: 'secret', label: 'Server password', required: true, secret: true, help: 'Password for the Actual server.',
      },
      {
        key: 'budgetId', envVar: 'ACTUAL_BUDGET_ID', type: 'text', label: 'Budget sync ID', required: true, help: 'Settings → Show advanced settings → Sync ID.',
      },
      {
        key: 'e2ePassword', envVar: 'ACTUAL_E2E_PASSWORD', type: 'secret', label: 'End-to-end encryption password', secret: true, help: 'Only if your budget is E2E encrypted.',
      },
    ],
  },
  {
    id: 'llm',
    title: 'LLM Provider',
    icon: '🧠',
    description: 'Which AI model classifies your transactions.',
    fields: [
      {
        key: 'llmProvider', envVar: 'LLM_PROVIDER', type: 'select', label: 'Provider', suggestions: PROVIDERS, help: 'Selects which provider block below is used.',
      },
      // openai
      {
        key: 'openaiApiKey', envVar: 'OPENAI_API_KEY', type: 'secret', label: 'OpenAI API key', secret: true, required: true, showWhen: ['llmProvider', ['openai']],
      },
      {
        key: 'openaiModel', envVar: 'OPENAI_MODEL', type: 'text', label: 'OpenAI model', default: 'gpt-4.1-mini', showWhen: ['llmProvider', ['openai']], suggestions: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-5-mini'],
      },
      {
        key: 'openaiBaseURL', envVar: 'OPENAI_BASE_URL', type: 'url', label: 'OpenAI base URL', default: 'https://api.openai.com/v1', pinnable: true, showWhen: ['llmProvider', ['openai']],
      },
      // openrouter
      {
        key: 'openrouterApiKey', envVar: 'OPENROUTER_API_KEY', type: 'secret', label: 'OpenRouter API key', secret: true, required: true, showWhen: ['llmProvider', ['openrouter']],
      },
      {
        key: 'openrouterModel', envVar: 'OPENROUTER_MODEL', type: 'text', label: 'OpenRouter model', default: 'deepseek/deepseek-v3.2', showWhen: ['llmProvider', ['openrouter']],
      },
      {
        key: 'openrouterBaseURL', envVar: 'OPENROUTER_BASE_URL', type: 'url', label: 'OpenRouter base URL', default: 'https://openrouter.ai/api/v1', pinnable: true, showWhen: ['llmProvider', ['openrouter']],
      },
      {
        key: 'openrouterReferrer', envVar: 'OPENROUTER_REFERRER', aliases: ['OPENROUTER_REFERER'], type: 'text', label: 'OpenRouter referrer', showWhen: ['llmProvider', ['openrouter']],
      },
      {
        key: 'openrouterTitle', envVar: 'OPENROUTER_TITLE', type: 'text', label: 'OpenRouter title', default: 'actual-ai', showWhen: ['llmProvider', ['openrouter']],
      },
      {
        key: 'openrouterEnableToolCalling', envVar: 'OPENROUTER_ENABLE_TOOL_CALLING', type: 'bool', label: 'Enable model tool-calling', showWhen: ['llmProvider', ['openrouter']], help: 'Off by default; some gateways return unstable tool-call responses.',
      },
      // anthropic
      {
        key: 'anthropicApiKey', envVar: 'ANTHROPIC_API_KEY', type: 'secret', label: 'Anthropic API key', secret: true, required: true, showWhen: ['llmProvider', ['anthropic']],
      },
      {
        key: 'anthropicModel', envVar: 'ANTHROPIC_MODEL', type: 'text', label: 'Anthropic model', default: 'claude-3-5-sonnet-latest', showWhen: ['llmProvider', ['anthropic']],
      },
      {
        key: 'anthropicBaseURL', envVar: 'ANTHROPIC_BASE_URL', type: 'url', label: 'Anthropic base URL', default: 'https://api.anthropic.com/v1', pinnable: true, showWhen: ['llmProvider', ['anthropic']],
      },
      // google
      {
        key: 'googleApiKey', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', type: 'secret', label: 'Google API key', secret: true, required: true, showWhen: ['llmProvider', ['google-generative-ai']],
      },
      {
        key: 'googleModel', envVar: 'GOOGLE_GENERATIVE_AI_MODEL', aliases: ['GOOGLE_GENERATIVE_MODEL'], type: 'text', label: 'Google model', default: 'gemini-1.5-flash', showWhen: ['llmProvider', ['google-generative-ai']],
      },
      {
        key: 'googleBaseURL', envVar: 'GOOGLE_GENERATIVE_AI_BASE_URL', aliases: ['GOOGLE_GENERATIVE_BASE_URL'], type: 'url', label: 'Google base URL', default: 'https://generativelanguage.googleapis.com', pinnable: true, showWhen: ['llmProvider', ['google-generative-ai']],
      },
      // ollama
      {
        key: 'ollamaModel', envVar: 'OLLAMA_MODEL', type: 'text', label: 'Ollama model', default: 'llama3.1', showWhen: ['llmProvider', ['ollama']],
      },
      {
        key: 'ollamaBaseURL', envVar: 'OLLAMA_BASE_URL', type: 'url', label: 'Ollama base URL', default: 'http://localhost:11434/api', pinnable: true, showWhen: ['llmProvider', ['ollama']],
      },
      // groq
      {
        key: 'groqApiKey', envVar: 'GROQ_API_KEY', type: 'secret', label: 'Groq API key', secret: true, required: true, showWhen: ['llmProvider', ['groq']],
      },
      {
        key: 'groqModel', envVar: 'GROQ_MODEL', type: 'text', label: 'Groq model', default: 'llama-3.3-70b-versatile', showWhen: ['llmProvider', ['groq']],
      },
      {
        key: 'groqBaseURL', envVar: 'GROQ_BASE_URL', type: 'url', label: 'Groq base URL', default: 'https://api.groq.com/openai/v1', pinnable: true, showWhen: ['llmProvider', ['groq']],
      },
      {
        key: 'llmTimeoutMs', envVar: 'LLM_TIMEOUT_MS', type: 'number', label: 'LLM timeout (ms)', default: '120000', help: 'Per-request timeout for LLM calls.',
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: '🕒',
    description: 'When classification runs.',
    fields: [
      {
        key: 'cronSchedule', envVar: 'CLASSIFICATION_SCHEDULE_CRON', type: 'cron', label: 'Cron schedule', default: '0 */4 * * *', help: 'Standard 5-field cron. Sub-minute schedules are rejected.',
      },
      {
        key: 'classifyOnStartup', envVar: 'CLASSIFY_ON_STARTUP', type: 'bool', label: 'Run on startup', featureFlag: 'classifyOnStartup', help: 'Classify once immediately when the app starts.',
      },
      {
        key: 'syncAccountsBeforeClassify', envVar: 'SYNC_ACCOUNTS_BEFORE_CLASSIFY', type: 'bool', label: 'Sync accounts before classify', featureFlag: 'syncAccountsBeforeClassify',
      },
    ],
  },
  {
    id: 'categorization',
    title: 'Categorization',
    icon: '🏷️',
    description: 'How transactions are matched and tagged.',
    fields: [
      {
        key: 'suggestNewCategories', envVar: 'FEATURES', type: 'bool', label: 'Suggest new categories', featureFlag: 'suggestNewCategories', help: 'Let the LLM invent categories for unmatched transactions.',
      },
      {
        key: 'rerunMissedTransactions', envVar: 'FEATURES', type: 'bool', label: 'Re-run missed transactions', featureFlag: 'rerunMissedTransactions',
      },
      {
        key: 'guessedTag', envVar: 'GUESSED_TAG', type: 'tag', label: 'Guessed tag', default: '#actual-ai', help: 'Written into the notes of categorized transactions.',
      },
      {
        key: 'notGuessedTag', envVar: 'NOT_GUESSED_TAG', type: 'tag', label: 'Not-guessed tag', default: '#actual-ai-miss',
      },
      {
        key: 'manualOverrideTag', envVar: 'MANUAL_OVERRIDE_TAG', type: 'tag', label: 'Manual override tag', default: '#actual-ai-override', help: 'Tag your own corrections so the LLM learns from them.',
      },
    ],
  },
  {
    id: 'tools',
    title: 'Tools & Rate Limits',
    icon: '🛠️',
    description: 'Web search tools and provider rate limiting.',
    fields: [
      {
        key: 'webSearch', envVar: 'FEATURES', type: 'bool', label: 'Web search (ValueSerp, paid)', featureFlag: 'webSearch',
      },
      {
        key: 'freeWebSearch', envVar: 'FEATURES', type: 'bool', label: 'Free web search (DuckDuckGo)', featureFlag: 'freeWebSearch',
      },
      {
        key: 'valueSerpApiKey', envVar: 'VALUESERP_API_KEY', type: 'secret', label: 'ValueSerp API key', secret: true, required: true, showWhen: ['webSearch', ['true']], help: 'Required when paid web search is on.',
      },
      {
        key: 'batchSize', envVar: 'BATCH_SIZE', type: 'number', label: 'Batch size', default: '20',
      },
      {
        key: 'batchDelayMs', envVar: 'BATCH_DELAY_MS', type: 'number', label: 'Batch delay (ms)', default: '2000',
      },
      {
        key: 'requestsPerMinuteOverride', envVar: 'REQUESTS_PER_MINUTE', type: 'rate', label: 'Requests/min override', help: 'Empty = provider default, 0 = disable this axis, >0 = custom.',
      },
      {
        key: 'tokensPerMinuteOverride', envVar: 'TOKENS_PER_MINUTE', type: 'rate', label: 'Tokens/min override', help: 'Empty = provider default, 0 = disable this axis, >0 = custom.',
      },
      {
        key: 'disableRateLimiter', envVar: 'FEATURES', type: 'bool', label: 'Disable rate limiter', featureFlag: 'disableRateLimiter',
      },
    ],
  },
  {
    id: 'prompt',
    title: 'Prompt',
    icon: '📝',
    description: 'The Handlebars template sent to the LLM.',
    fields: [
      {
        key: 'promptTemplate', envVar: 'PROMPT_TEMPLATE', type: 'textarea', label: 'Prompt template', maxLen: 8192, help: 'Handlebars. Variables: amount, type, payee, description, date, categoryGroups, rules.',
      },
    ],
  },
  {
    id: 'writes',
    title: 'Writes & Safety',
    icon: '⚠️',
    description: 'Dry run is ON by default. Turning it off lets actual-ai write to your budget.',
    fields: [
      {
        key: 'dryRun', envVar: 'FEATURES', type: 'bool', label: 'Dry run (no writes)', featureFlag: 'dryRun', help: 'When ON, all changes are logged but never written.',
      },
    ],
  },
];

/** Flat list of all editable field defs. */
export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

/** Lookup a field def by its canonical key. */
export function fieldByKey(key: string): FieldDef | undefined {
  return ALL_FIELDS.find((f) => f.key === key);
}

/** Keys backed by the FEATURES JSON array. */
export const FEATURE_FLAG_FIELDS: FieldDef[] = ALL_FIELDS.filter((f) => f.featureFlag);

/** Secret keys (never serialized to the client as values). */
export const SECRET_KEYS: string[] = ALL_FIELDS.filter((f) => f.secret).map((f) => f.key);

/** URL keys where OS-env pins over overlay. */
export const PINNABLE_ENV_VARS: string[] = ALL_FIELDS.filter((f) => f.pinnable).map((f) => f.envVar);
