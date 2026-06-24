import {
  api, setToken, hasToken, setTicket,
} from '/api.js';
import { el, renderField } from '/schema-render.js';

// ---------------- state ----------------
let cfg = null; // GET /api/config payload
const dirtyValues = {}; // key -> string
const dirtySecrets = {}; // key -> { action, value }
const fieldErrors = {}; // key -> string
let activeSection = 'debug';

const $ = (id) => document.getElementById(id);

// ---------------- helpers ----------------
function allFields() {
  return cfg.schema.flatMap((s) => s.fields);
}
function fieldByKey(key) {
  return allFields().find((f) => f.key === key);
}
function isPinned(field) {
  return field.pinnable && cfg.pinnedByEnv.includes(field.envVar);
}
function currentValue(field) {
  if (field.secret) return '';
  if (dirtyValues[field.key] !== undefined) return dirtyValues[field.key];
  return (cfg.pending.values[field.key]) ?? '';
}
function runningValue(field) {
  if (field.secret) return cfg.running.secrets[field.key]?.set ? '(set)' : '(unset)';
  return cfg.running.values[field.key] ?? '';
}
function secretSet(field) {
  if (dirtySecrets[field.key]?.action === 'clear') return false;
  if (dirtySecrets[field.key]?.action === 'replace') return true;
  return !!cfg.pending.secrets[field.key]?.set;
}
function isVisible(field) {
  if (!field.showWhen) return true;
  const [depKey, allowed] = field.showWhen;
  const depField = fieldByKey(depKey);
  const val = depField ? currentValue(depField) : '';
  return allowed.includes(val);
}
function dirtyCount() {
  return Object.keys(dirtyValues).length + Object.keys(dirtySecrets).filter((k) => dirtySecrets[k].action !== 'keep').length;
}
function sectionDirtyCount(section) {
  return section.fields.filter((f) => dirtyValues[f.key] !== undefined
    || (dirtySecrets[f.key] && dirtySecrets[f.key].action !== 'keep')).length;
}

// lightweight client validation (server is authoritative)
function validate(field, value) {
  if (!value) return null;
  if (field.type === 'url') {
    try { const u = new URL(value); if (!/^https?:$/.test(u.protocol)) return 'Must be http(s).'; } catch { return 'Invalid URL.'; }
  }
  if (field.type === 'tag') {
    if (!value.startsWith('#')) return 'Must start with "#".';
    if (/\s/.test(value)) return 'No whitespace allowed.';
  }
  if (field.type === 'cron') {
    const parts = value.trim().split(/\s+/);
    if (parts.length === 6 || (parts.length === 5 && parts[0] === '*')) return 'Sub-minute schedules are not supported.';
    if (parts.length !== 5) return 'Cron needs 5 fields.';
  }
  if ((field.type === 'number' || field.type === 'rate') && !/^\d+$/.test(value)) return 'Must be a whole number.';
  return null;
}

function onValue(key, value) {
  const field = fieldByKey(key);
  const running = (cfg.pending.values[key]) ?? '';
  if (value === running) delete dirtyValues[key];
  else dirtyValues[key] = value;
  const err = validate(field, value);
  if (err) fieldErrors[key] = err; else delete fieldErrors[key];
  renderSaveBar();
  // Re-render section so conditional fields & dirty markers update.
  renderMain();
}
function onSecret(key, action, value) {
  if (action === 'keep') delete dirtySecrets[key];
  else dirtySecrets[key] = { action, value };
  renderSaveBar();
  renderMain();
}

// ---------------- toasts & modals ----------------
function toast(msg, kind = '') {
  const t = el('div', { class: `toast ${kind}`, text: msg });
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function closeModal() { $('modal-root').replaceChildren(); }
function openModal({ title, body, actions }) {
  const foot = el('div', { class: 'modal-foot' });
  for (const a of actions) foot.appendChild(a);
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head', text: title }),
    el('div', { class: 'modal-body' }, body),
    foot,
  ]);
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) closeModal(); } }, [modal]);
  $('modal-root').replaceChildren(backdrop);
}

// ---------------- badges ----------------
function renderBadges() {
  const mode = cfg.mockMode ? ['MOCK', 'warn'] : (runningValue(fieldByKey('dryRun')) === 'true' ? ['DRY RUN', 'good'] : ['LIVE', 'bad']);
  const boot = cfg.bootError ? ['Boot: FAILED', 'bad'] : ['Boot: OK', 'good'];
  const pending = (cfg.restartPending || dirtyCount() > 0) ? ['Pending: yes', 'warn'] : ['Pending: no', 'good'];
  const make = ([text, kind]) => el('span', { class: `badge ${kind}`, text }, [], );
  const wrap = $('badges');
  wrap.replaceChildren(
    el('span', { class: `badge ${mode[1]}` }, [el('span', { class: 'dot' }), `Mode: ${mode[0]}`]),
    el('span', { class: `badge ${boot[1]}` }, [el('span', { class: 'dot' }), boot[0]]),
    el('span', { class: `badge ${pending[1]}` }, [el('span', { class: 'dot' }), pending[0]]),
  );
}

// ---------------- nav ----------------
function navSections() {
  return [{ id: 'debug', title: 'Status & Debug', icon: '📊' }, ...cfg.schema.map((s) => ({ id: s.id, title: s.title, icon: s.icon }))];
}
function renderNav() {
  const nav = $('nav');
  nav.replaceChildren(...navSections().map((s) => {
    const section = cfg.schema.find((x) => x.id === s.id);
    const dc = section ? sectionDirtyCount(section) : 0;
    const item = el('button', {
      class: `nav-item${activeSection === s.id ? ' active' : ''}`,
      type: 'button',
      onclick: () => { window.location.hash = `#/${s.id}`; },
    }, [el('span', { text: s.icon || '•' }), el('span', { text: s.title })]);
    if (dc > 0) item.appendChild(el('span', { class: 'count', text: String(dc) }));
    return item;
  }));
}

// ---------------- form sections ----------------
function renderFormSection(section) {
  const main = $('main');
  main.replaceChildren();
  main.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: `${section.icon || ''} ${section.title}` }),
    section.description ? el('p', { text: section.description }) : null,
  ]));

  if (cfg.restartPending) {
    main.appendChild(el('div', { class: 'banner restart' }, [
      el('strong', { text: 'Restart pending' }),
      'Saved changes take effect after you restart the actual-ai container.',
    ]));
  }

  const card = el('div', { class: 'card' });
  let shown = 0;
  for (const field of section.fields) {
    if (!isVisible(field)) continue;
    shown += 1;
    card.appendChild(renderField(field, {
      value: currentValue(field),
      effective: runningValue(field),
      secretSet: secretSet(field),
      secretAction: dirtySecrets[field.key]?.action,
      secretValue: dirtySecrets[field.key]?.value,
      pinned: isPinned(field),
      dirty: dirtyValues[field.key] !== undefined || (dirtySecrets[field.key] && dirtySecrets[field.key].action !== 'keep'),
      error: fieldErrors[field.key],
      onValue,
      onSecret,
    }));
  }
  if (section.id === 'prompt') {
    card.appendChild(el('div', { style: 'margin-top:12px' }, [
      el('button', {
        class: 'ghost-btn', type: 'button', text: 'Reset to default prompt', onclick: resetPrompt,
      }),
    ]));
  }
  if (shown === 0) card.appendChild(el('p', { class: 'muted', text: 'No fields apply to the current selection.' }));
  main.appendChild(card);
}

async function resetPrompt() {
  const r = await api.resetPrompt();
  onValue('promptTemplate', r.default);
  toast('Prompt reset to default (not yet saved).');
}

// ---------------- debug section ----------------
function renderDebugSection() {
  const main = $('main');
  main.replaceChildren();
  main.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: '📊 Status & Debug' }),
    el('p', { text: 'Inspect effective config, test connections, and preview a dry run with mock data.' }),
  ]));

  if (cfg.bootError) {
    main.appendChild(el('div', { class: 'banner error' }, [
      el('strong', { text: 'Service graph failed to build' }),
      el('span', { class: 'mono', text: String(cfg.bootError).slice(0, 300) }),
    ]));
  }

  // status card
  const mode = cfg.mockMode ? 'MOCK DATA' : (runningValue(fieldByKey('dryRun')) === 'true' ? 'DRY RUN (no writes)' : 'LIVE — will write to your budget');
  const status = el('div', { class: 'card' }, [
    el('h3', { text: 'Status' }),
    el('div', { class: 'status-grid' }, [
      el('div', {}, [el('div', { class: 'muted', text: 'Write mode (running)' }), el('div', { text: mode })]),
      el('div', {}, [el('div', { class: 'muted', text: 'Runnable' }), el('div', { text: cfg.runnable ? 'Yes' : 'No — check schedule/startup' })]),
    ]),
    el('div', { id: 'lastrun', class: 'muted', style: 'margin-top:12px', text: 'Loading last run…' }),
  ]);
  main.appendChild(status);
  api.lastRun().then((s) => {
    $('lastrun').textContent = s.hasEverRun
      ? `Last run: success ${s.lastSuccessAt || '—'}${s.lastErrorAt ? `, last error ${s.lastErrorAt}` : ''}`
      : 'Has never run yet.';
  }).catch(() => {});

  // test connection cards
  main.appendChild(testCard('Test Actual connection', cfg.mockMode ? 'Uses MOCK data.' : 'Downloads your budget into a scratch dir (read-only).', 'actual'));
  main.appendChild(llmTestCard());

  // preview card
  main.appendChild(previewCard());

  // cron + rate limiter
  main.appendChild(infoCard('Schedule', 'cron'));
  main.appendChild(infoCard('Rate limiter', 'rate'));

  // effective config viewer
  main.appendChild(effectiveCard());
}

function testCard(title, sub, kind) {
  const out = el('div', { class: 'result-box', hidden: true });
  const btn = el('button', {
    class: 'ghost-btn',
    type: 'button',
    text: 'Run test',
    onclick: async () => {
      btn.disabled = true; btn.textContent = 'Testing…';
      try {
        const r = await api.testActual();
        out.hidden = false;
        out.className = `result-box ${r.ok ? 'good' : 'bad'}`;
        out.replaceChildren(r.ok
          ? el('div', {}, [el('strong', { text: '✓ Connected. ' }), `${r.accountCount} accounts, ${r.categoryGroupCount} category groups.`, r.mock ? el('span', { class: 'chip mock', text: ' MOCK', style: 'margin-left:8px' }) : null])
          : el('div', {}, [el('strong', { text: '✗ Failed: ' }), r.category]));
      } catch (e) { out.hidden = false; out.className = 'result-box bad'; out.textContent = `Error: ${e.message}`; } finally { btn.disabled = false; btn.textContent = 'Run test'; }
    },
  });
  return el('div', { class: 'card' }, [el('h3', { text: title }), el('p', { class: 'card-sub', text: sub }), el('div', { class: 'btn-row' }, [btn]), out]);
}

function llmTestCard() {
  const out = el('div', { class: 'result-box', hidden: true });
  const btn = el('button', {
    class: 'ghost-btn', type: 'button', text: 'Test LLM', onclick: async () => {
      const dest = await api.llmDestination();
      openModal({
        title: 'Send a test request?',
        body: [
          el('p', {}, [`This sends ONE request to your configured model. Destination: `]),
          el('div', { class: 'kv' }, [
            el('span', { class: 'k', text: 'Provider' }), el('span', { text: dest.provider }),
            el('span', { class: 'k', text: 'Host' }), el('span', { class: 'mono', text: dest.host }),
            el('span', { class: 'k', text: 'Model' }), el('span', { class: 'mono', text: dest.model }),
          ]),
          cfg.mockMode ? el('p', { class: 'chip mock', text: 'MOCK — no real request' }) : el('p', { class: 'muted', text: 'A real request may incur cost.' }),
        ],
        actions: [
          el('button', { class: 'ghost-btn', type: 'button', text: 'Cancel', onclick: closeModal }),
          el('button', {
            class: 'primary-btn', type: 'button', text: 'Send', onclick: async () => {
              closeModal(); btn.disabled = true; btn.textContent = 'Testing…';
              try {
                const r = await api.testLlm();
                out.hidden = false; out.className = `result-box ${r.ok ? 'good' : 'bad'}`;
                out.replaceChildren(r.ok
                  ? el('div', {}, [el('strong', { text: '✓ OK ' }), `${r.model} @ ${r.resolvedHost} (${r.latencyMs}ms): "${r.responsePreview}"`, r.mock ? el('span', { class: 'chip mock', text: ' MOCK', style: 'margin-left:8px' }) : null])
                  : el('div', {}, [el('strong', { text: '✗ ' }), `${r.category}: ${r.error || ''}`]));
              } catch (e) {
                out.hidden = false; out.className = 'result-box bad';
                out.textContent = e.status === 429 ? `Cooldown — wait ${(e.data?.retryAfterMs / 1000).toFixed(0)}s` : `Error: ${e.message}`;
              } finally { btn.disabled = false; btn.textContent = 'Test LLM'; }
            },
          }),
        ],
      });
    },
  });
  return el('div', { class: 'card' }, [el('h3', { text: 'Test LLM' }), el('p', { class: 'card-sub', text: 'Confirms credentials and shows the destination host before sending.' }), el('div', { class: 'btn-row' }, [btn]), out]);
}

function previewCard() {
  const out = el('div', { hidden: true });
  const btn = el('button', {
    class: 'primary-btn', type: 'button', text: 'Run dry-run preview', onclick: async () => {
      btn.disabled = true; btn.textContent = 'Running…';
      try {
        await api.runPreview();
        const status = await api.previewStatus();
        renderPreview(out, status.lastPreview);
      } catch (e) {
        out.hidden = false; out.replaceChildren(el('div', { class: 'result-box bad', text: e.status === 429 ? 'Cooldown, try again shortly.' : `Error: ${e.message}` }));
      } finally { btn.disabled = false; btn.textContent = 'Run dry-run preview'; }
    },
  });
  return el('div', { class: 'card' }, [
    el('h3', { text: 'Dry-run preview' }),
    el('p', { class: 'card-sub', text: 'Runs the real prompt + filter pipeline against MOCK transactions with a MOCK agent. Makes no changes and runs no sync.' }),
    el('div', { class: 'btn-row' }, [btn]), out,
  ]);
}

function renderPreview(out, p) {
  out.hidden = false;
  if (!p) { out.replaceChildren(el('div', { class: 'result-box', text: 'No preview yet.' })); return; }
  if (p.error) { out.replaceChildren(el('div', { class: 'result-box bad', text: `Preview error: ${p.error}` })); return; }
  const head = el('div', { class: 'result-box good' }, [
    el('strong', { text: `${p.wouldCategorize} of ${p.considered} would be categorized ` }),
    el('span', { class: 'chip mock', text: 'MOCK DATA' }),
    el('div', { class: 'muted', style: 'margin-top:4px', text: `${p.skipped} transactions skipped by filters.` }),
  ]);
  const distTbl = el('table', {}, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Proposed category' }), el('th', { text: 'Count' })])),
    el('tbody', {}, p.distribution.map((d) => el('tr', {}, [el('td', { text: d.category }), el('td', { text: String(d.count) })]))),
  ]);
  const sampleTbl = el('table', {}, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Payee' }), el('th', { text: 'Amount' }), el('th', { text: 'Proposed category' })])),
    el('tbody', {}, p.sample.map((s) => el('tr', { class: s.isNew ? 'is-new' : '' }, [
      el('td', { text: s.payee }),
      el('td', { class: `amount ${s.amount < 0 ? 'neg' : 'pos'}`, text: (s.amount / 100).toFixed(2) }),
      el('td', { text: s.proposedCategory }),
    ]))),
  ]);
  out.replaceChildren(head, el('h4', { text: 'Distribution', style: 'margin:16px 0 6px' }), distTbl, el('h4', { text: 'Sample (new categories first)', style: 'margin:16px 0 6px' }), sampleTbl);
}

function infoCard(title, kind) {
  const box = el('div', { class: 'result-box', text: 'Loading…' });
  const loader = kind === 'cron' ? api.cron() : api.rateLimiter();
  loader.then((d) => {
    if (kind === 'cron') {
      box.replaceChildren(el('div', { class: 'kv' }, [
        el('span', { class: 'k', text: 'Schedule' }), el('span', { class: 'mono', text: d.schedule || '(none)' }),
        el('span', { class: 'k', text: 'Meaning' }), el('span', { text: d.humanReadable }),
        el('span', { class: 'k', text: 'Next runs' }), el('span', { text: (d.nextRuns || []).map((x) => new Date(x).toLocaleString()).join('  •  ') || (d.blocked ? 'blocked (sub-minute)' : '—') }),
        el('span', { class: 'k', text: 'Run on startup' }), el('span', { text: d.classifyOnStartup ? 'yes' : 'no' }),
      ]));
    } else {
      box.replaceChildren(el('div', { class: 'kv' }, [
        el('span', { class: 'k', text: 'Provider' }), el('span', { text: d.provider }),
        el('span', { class: 'k', text: 'Requests/min' }), el('span', { text: d.disabled ? 'disabled' : (d.requestsPerMinute ?? 'provider default') }),
        el('span', { class: 'k', text: 'Tokens/min' }), el('span', { text: d.disabled ? 'disabled' : (d.tokensPerMinute ?? 'provider default') }),
      ]));
    }
  }).catch((e) => { box.textContent = `Error: ${e.message}`; });
  return el('div', { class: 'card' }, [el('h3', { text: title }), box]);
}

function effectiveCard() {
  const rows = [];
  for (const section of cfg.schema) {
    for (const f of section.fields) {
      const val = f.secret ? (cfg.pending.secrets[f.key]?.set ? '••••••' : '(unset)') : (cfg.pending.values[f.key] || f.default || '(default)');
      const pinned = isPinned(f);
      rows.push(el('tr', {}, [
        el('td', { class: 'muted', text: f.envVar }),
        el('td', { class: 'mono', text: String(val) }),
        el('td', {}, [pinned ? el('span', { class: 'chip pinned', text: 'env' }) : el('span', { class: 'chip', text: 'overlay/default' })]),
      ]));
    }
  }
  return el('div', { class: 'card' }, [
    el('h3', { text: 'Effective configuration (after restart)' }),
    el('p', { class: 'card-sub', text: 'Secrets are never shown. Values pinned by the environment override the overlay.' }),
    el('table', {}, [el('thead', {}, el('tr', {}, [el('th', { text: 'Variable' }), el('th', { text: 'Value' }), el('th', { text: 'Source' })])), el('tbody', {}, rows)]),
  ]);
}

// ---------------- save flow ----------------
function buildPatch() {
  const values = {};
  for (const [k, v] of Object.entries(dirtyValues)) values[k] = v;
  const secrets = {};
  for (const [k, s] of Object.entries(dirtySecrets)) {
    if (s.action !== 'keep') secrets[k] = { action: s.action, value: s.value };
  }
  return { values, secrets };
}

function reviewAndSave() {
  // client validation gate
  const errs = Object.keys(fieldErrors);
  if (errs.length) { toast(`Fix ${errs.length} invalid field(s) first.`, 'bad'); return; }

  const diffs = [];
  for (const key of Object.keys(dirtyValues)) {
    const f = fieldByKey(key);
    diffs.push({ label: f.label, from: cfg.running.values[key] || '(default)', to: dirtyValues[key] || '(default)', pinned: isPinned(f), envVar: f.envVar });
  }
  for (const key of Object.keys(dirtySecrets)) {
    if (dirtySecrets[key].action === 'keep') continue;
    const f = fieldByKey(key);
    diffs.push({ label: f.label, from: cfg.running.secrets[key]?.set ? '(set)' : '(unset)', to: dirtySecrets[key].action === 'clear' ? '(cleared)' : '(replaced)', secret: true });
  }

  const writesGoingLive = dirtyValues.dryRun === 'false' && runningValue(fieldByKey('dryRun')) === 'true';
  const body = [];
  if (writesGoingLive) {
    body.push(el('div', { class: 'banner error' }, [el('strong', { text: '⚠ You are enabling writes' }), 'After restart, actual-ai will modify your real budget.']));
  }
  body.push(el('p', { class: 'muted', text: 'These changes apply after the next restart:' }));
  for (const d of diffs) {
    const row = el('div', { class: 'diff-row' }, [
      el('div', {}, [el('div', { class: 'diff-label', text: d.label })]),
      el('div', { class: 'from', text: String(d.from) }),
      el('div', { class: 'to', text: String(d.to) }),
    ]);
    if (d.pinned) row.appendChild(el('div', { class: 'pinned-note', text: `Ignored after restart while ${d.envVar} is set.` }));
    body.push(row);
  }

  openModal({
    title: `Save ${diffs.length} change(s)?`,
    body,
    actions: [
      el('button', { class: 'ghost-btn', type: 'button', text: 'Cancel', onclick: closeModal }),
      el('button', { class: 'primary-btn', type: 'button', text: 'Save', onclick: doSave }),
    ],
  });
}

async function doSave() {
  closeModal();
  try {
    const res = await api.patchConfig(buildPatch());
    if (!res.ok) {
      if (res.key) { fieldErrors[res.key] = res.detail || res.error; toast(`${res.key}: ${res.detail || res.error}`, 'bad'); }
      else toast(`Save failed: ${res.error}`, 'bad');
      renderMain(); return;
    }
    for (const [k, action] of Object.entries(res.secretActions || {})) {
      if (action !== 'kept') toast(`${fieldByKey(k).label}: ${action}`, 'good');
    }
    toast(`Saved ${res.savedKeys?.length || 0} setting(s). Restart to apply.`, 'good');
    Object.keys(dirtyValues).forEach((k) => delete dirtyValues[k]);
    Object.keys(dirtySecrets).forEach((k) => delete dirtySecrets[k]);
    await load();
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'bad');
  }
}

function renderSaveBar() {
  const n = dirtyCount();
  const bar = $('savebar');
  bar.hidden = n === 0;
  $('savebar-text').textContent = `${n} unsaved change${n === 1 ? '' : 's'}`;
  renderBadges();
  renderNav();
}

// ---------------- render orchestration ----------------
function renderMain() {
  if (activeSection === 'debug') renderDebugSection();
  else {
    const section = cfg.schema.find((s) => s.id === activeSection);
    if (section) renderFormSection(section);
    else renderDebugSection();
  }
  renderNav();
  renderBadges();
}

function route() {
  const hash = window.location.hash.replace('#/', '') || 'debug';
  activeSection = hash;
  if (cfg) renderMain();
}

async function load() {
  cfg = await api.getConfig();
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  renderMain();
  renderSaveBar();
}

// ---------------- boot ----------------
function hideAllGates() {
  $('token-gate').hidden = true;
  $('unlock-gate').hidden = true;
}

async function enterApp() {
  await load();
  hideAllGates();
  $('app').hidden = false;
}

function showUnlockGate(status, message) {
  $('app').hidden = true;
  $('token-gate').hidden = true;
  $('unlock-gate').hidden = false;
  $('unlock-prompt').textContent = status.prompt || 'Prove you have access to this budget.';
  const input = $('unlock-input');
  const err = $('unlock-error');
  if (status.locked) {
    const secs = Math.max(0, Math.ceil((status.lockedUntilMs - Date.now()) / 1000));
    input.disabled = true;
    err.hidden = false;
    err.textContent = `Too many attempts. Try again in ~${Math.ceil(secs / 60)} min.`;
  } else {
    input.disabled = false;
    if (message) { err.hidden = false; err.textContent = message; } else { err.hidden = true; }
    input.focus();
  }
}

// After the token is accepted, run the knowledge-challenge step when configured.
async function tryStart(token) {
  setToken(token);
  setTicket('');
  const status = await api.unlockStatus();
  if (status.enabled && !status.bypass) {
    showUnlockGate(status);
    return;
  }
  if (status.enabled && status.bypass) {
    await enterApp();
    toast('Budget unreachable — unlock challenge skipped. Fix the connection, then restart.', 'bad');
    return;
  }
  await enterApp();
}

function showGate(message) {
  $('app').hidden = true;
  $('unlock-gate').hidden = true;
  $('token-gate').hidden = false;
  if (message) { const e = $('token-error'); e.hidden = false; e.textContent = message; }
}

$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const answer = $('unlock-input').value;
  try {
    const r = await api.unlock(answer);
    if (r.ok && r.ticket) {
      setTicket(r.ticket);
      $('unlock-input').value = '';
      await enterApp();
      if (r.bypass) toast('Budget unreachable — answer not verified. Fix the connection.', 'bad');
    }
  } catch (err) {
    const data = err.data || {};
    if (data.error === 'locked') {
      showUnlockGate({ ...data, prompt: $('unlock-prompt').textContent, locked: true });
    } else if (data.error === 'no_match') {
      $('unlock-input').value = '';
      const left = data.attemptsRemaining;
      const erEl = $('unlock-error');
      erEl.hidden = false;
      erEl.textContent = `That didn't match. ${left} attempt${left === 1 ? '' : 's'} left.`;
    } else {
      const erEl = $('unlock-error');
      erEl.hidden = false;
      erEl.textContent = `Error: ${err.message}`;
    }
  }
});
$('unlock-logout').addEventListener('click', () => { setToken(''); setTicket(''); showGate(); });

window.addEventListener('hashchange', route);
$('save-btn').addEventListener('click', reviewAndSave);
$('discard-btn').addEventListener('click', () => {
  Object.keys(dirtyValues).forEach((k) => delete dirtyValues[k]);
  Object.keys(dirtySecrets).forEach((k) => delete dirtySecrets[k]);
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  renderMain(); renderSaveBar();
});
$('logout').addEventListener('click', () => {
  api.lock().catch(() => {});
  setToken(''); setTicket(''); showGate();
});
$('token-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('token-input').value.trim();
  try { activeSection = (window.location.hash.replace('#/', '') || 'debug'); await tryStart(token); } catch (err) {
    showGate(err.status === 401 ? 'Invalid token.' : `Error: ${err.message}`);
  }
});
window.addEventListener('beforeunload', (e) => { if (dirtyCount() > 0) { e.preventDefault(); e.returnValue = ''; } });

// Always start at the gate (token only lives in memory).
showGate();
