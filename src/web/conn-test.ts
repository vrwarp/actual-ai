import fs from 'fs';
import os from 'os';
import path from 'path';
import * as actualApiClient from '@actual-app/api';
import { generateText } from 'ai';
import ActualApiService from '../actual-api-service';
import LlmModelFactory from '../llm-model-factory';
import { resolveConfig } from '../config';
import { pendingEnvMap } from './config-store';
import { scrub } from './redact';
import { MockActualApiService } from './mocks/mock-actual-api';

export interface ActualTestResult {
  ok: boolean;
  accountCount?: number;
  categoryGroupCount?: number;
  category?: 'connection_failed' | 'auth_failed' | 'reached_not_actual' | 'budget_not_found';
  testedAgainst: 'pending';
  mock?: boolean;
}

export interface LlmTestResult {
  ok: boolean;
  provider?: string;
  resolvedHost?: string;
  model?: string;
  latencyMs?: number;
  responsePreview?: string;
  error?: string;
  category?: 'auth_failed' | 'model_not_found' | 'connection_failed';
  mock?: boolean;
}

function categorizeActualError(message: string): ActualTestResult['category'] {
  const m = message.toLowerCase();
  if (m.includes('budget') && (m.includes('not') || m.includes('download'))) return 'budget_not_found';
  if (m.includes('401') || m.includes('unauthor') || m.includes('password')) return 'auth_failed';
  if (m.includes('not actual') || m.includes('unexpected') || m.includes('html')) return 'reached_not_actual';
  return 'connection_failed';
}

/** Test the Actual Budget connection using PENDING saved config. */
export async function testActual(mock: boolean): Promise<ActualTestResult> {
  if (mock) {
    const svc = new MockActualApiService();
    const accounts = await svc.getAccounts();
    const groups = await svc.getCategoryGroups();
    return {
      ok: true, accountCount: accounts.length, categoryGroupCount: groups.length, testedAgainst: 'pending', mock: true,
    };
  }

  const cfg = resolveConfig(pendingEnvMap());
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'actual-ai-test-'), { /* mode */ });
  try { fs.chmodSync(scratch, 0o700); } catch { /* best-effort */ }
  const svc = new ActualApiService(actualApiClient, fs, scratch, cfg.serverURL, cfg.password, cfg.budgetId, cfg.e2ePassword, true);
  try {
    await svc.initializeApi();
    const accounts = await svc.getAccounts();
    const groups = await svc.getCategoryGroups();
    await svc.shutdownApi();
    return {
      ok: true, accountCount: accounts.length, categoryGroupCount: groups.length, testedAgainst: 'pending',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, category: categorizeActualError(message), testedAgainst: 'pending' };
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return '(invalid url)'; }
}

function llmHost(cfg: ReturnType<typeof resolveConfig>): string {
  switch (cfg.llmProvider) {
    case 'openai': return hostOf(cfg.openaiBaseURL);
    case 'openrouter': return hostOf(cfg.openrouterBaseURL);
    case 'anthropic': return hostOf(cfg.anthropicBaseURL);
    case 'google-generative-ai': return hostOf(cfg.googleBaseURL);
    case 'ollama': return hostOf(cfg.ollamaBaseURL);
    case 'groq': return hostOf(cfg.groqBaseURL);
    default: return '(unknown)';
  }
}

function llmModel(cfg: ReturnType<typeof resolveConfig>): string {
  switch (cfg.llmProvider) {
    case 'openai': return cfg.openaiModel;
    case 'openrouter': return cfg.openrouterModel;
    case 'anthropic': return cfg.anthropicModel;
    case 'google-generative-ai': return cfg.googleModel;
    case 'ollama': return cfg.ollamaModel;
    case 'groq': return cfg.groqModel;
    default: return '(unknown)';
  }
}

/** Resolve provider/host/model without sending a request (for the confirm step). */
export function llmDestination(mock: boolean): { provider: string; host: string; model: string } {
  if (mock) return { provider: 'mock', host: 'localhost (mock)', model: 'mock-agent' };
  const cfg = resolveConfig(pendingEnvMap());
  return { provider: cfg.llmProvider, host: llmHost(cfg), model: llmModel(cfg) };
}

/** Send ONE tiny request to the configured LLM (the only paid call the UI can make). */
export async function testLlm(mock: boolean, nowMs: number): Promise<LlmTestResult> {
  if (mock) {
    return {
      ok: true, provider: 'mock', resolvedHost: 'localhost (mock)', model: 'mock-agent', latencyMs: 3, responsePreview: 'pong', mock: true,
    };
  }
  const cfg = resolveConfig(pendingEnvMap());
  const factory = new LlmModelFactory(
    cfg.llmProvider,
    cfg.openaiApiKey,
    cfg.openaiModel,
    cfg.openaiBaseURL,
    cfg.openrouterApiKey,
    cfg.openrouterModel,
    cfg.openrouterBaseURL,
    cfg.openrouterReferrer,
    cfg.openrouterTitle,
    cfg.anthropicBaseURL,
    cfg.anthropicApiKey,
    cfg.anthropicModel,
    cfg.googleModel,
    cfg.googleBaseURL,
    cfg.googleApiKey,
    cfg.ollamaModel,
    cfg.ollamaBaseURL,
    cfg.groqApiKey,
    cfg.groqModel,
    cfg.groqBaseURL,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const { text } = await generateText({
      model: factory.create(),
      prompt: 'Reply with the single word: pong',
      abortSignal: controller.signal,
    });
    return {
      ok: true,
      provider: cfg.llmProvider,
      resolvedHost: llmHost(cfg),
      model: llmModel(cfg),
      latencyMs: Date.now() - nowMs,
      responsePreview: scrub(text).slice(0, 80),
    };
  } catch (e) {
    const message = scrub(e instanceof Error ? e.message : String(e));
    const lower = message.toLowerCase();
    let category: LlmTestResult['category'] = 'connection_failed';
    if (lower.includes('401') || lower.includes('api key') || lower.includes('unauthor')) category = 'auth_failed';
    else if (lower.includes('model') && (lower.includes('not') || lower.includes('404'))) category = 'model_not_found';
    return {
      ok: false, provider: cfg.llmProvider, resolvedHost: llmHost(cfg), model: llmModel(cfg), error: message, category,
    };
  } finally {
    clearTimeout(timer);
  }
}
