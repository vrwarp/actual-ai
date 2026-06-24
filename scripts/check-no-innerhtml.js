#!/usr/bin/env node
/**
 * Guard the no-build frontend against XSS sinks. The strict CSP (default-src 'self')
 * already blocks inline script/style, but `.innerHTML`, `insertAdjacentHTML`, and
 * inline event handlers can still smuggle untrusted markup. Fail CI if any appear.
 */
const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, '..', 'src', 'web-ui');
const JS_PATTERNS = [
  { re: /\.innerHTML\s*=/, msg: 'assignment to .innerHTML' },
  { re: /\.outerHTML\s*=/, msg: 'assignment to .outerHTML' },
  { re: /insertAdjacentHTML\s*\(/, msg: 'insertAdjacentHTML()' },
  { re: /document\.write\s*\(/, msg: 'document.write()' },
];
const HTML_PATTERNS = [
  { re: /<script(?![^>]*\bsrc=)[^>]*>[^<]*\S/i, msg: 'inline <script> with body' },
  { re: /<style[\s>]/i, msg: 'inline <style>' },
  { re: /\son[a-z]+\s*=/i, msg: 'inline on* event handler' },
];

let failures = 0;
function scan(file, patterns) {
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const p of patterns) {
      if (p.re.test(line)) {
        console.error(`✗ ${path.relative(process.cwd(), file)}:${i + 1} — ${p.msg}`);
        failures += 1;
      }
    }
  });
}

for (const f of fs.readdirSync(UI_DIR)) {
  const full = path.join(UI_DIR, f);
  if (f.endsWith('.js')) scan(full, JS_PATTERNS);
  if (f.endsWith('.html')) scan(full, HTML_PATTERNS);
}

if (failures > 0) {
  console.error(`\n${failures} forbidden HTML-injection pattern(s) found in src/web-ui.`);
  process.exit(1);
}
console.log('✓ web-ui: no innerHTML / inline-handler sinks found.');
