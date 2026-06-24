// DOM builders. Everything is created via createElement + textContent — no innerHTML,
// no inline handlers — so the strict CSP (default-src 'self') holds.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('innerHTML is forbidden');
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'for') node.htmlFor = v;
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function helpEl(field, error) {
  const frag = document.createDocumentFragment();
  if (error) frag.appendChild(el('div', { class: 'err', role: 'alert', text: error }));
  if (field.help) frag.appendChild(el('div', { class: 'help', text: field.help }));
  return frag;
}

function datalist(id, options) {
  const dl = el('datalist', { id });
  for (const o of options) dl.appendChild(el('option', { value: o }));
  return dl;
}

/**
 * Render a single field. `ctx` supplies value/state and change callbacks.
 */
export function renderField(field, ctx) {
  const wrap = el('div', { class: `field${ctx.dirty ? ' dirty' : ''}` });
  const id = `f-${field.key}`;

  // Boolean → toggle
  if (field.type === 'bool') {
    const input = el('input', {
      type: 'checkbox',
      id,
      checked: ctx.value === 'true',
      onchange: (e) => ctx.onValue(field.key, e.target.checked ? 'true' : 'false'),
    });
    const sw = el('span', { class: 'switch' }, [input, el('span', { class: 'track' }), el('span', { class: 'thumb' })]);
    wrap.appendChild(el('div', { class: 'toggle' }, [sw, el('label', { for: id, text: field.label, style: 'margin:0' })]));
    wrap.appendChild(helpEl(field, ctx.error));
    return wrap;
  }

  // Secret → set/unset + keep/replace/clear
  if (field.secret) {
    wrap.appendChild(el('label', { for: id, text: field.label }));
    const stateText = ctx.secretSet
      ? el('span', { class: 'secret-state set', text: '● Currently set' })
      : el('span', { class: 'secret-state unset', text: '○ Not set' });
    wrap.appendChild(el('div', { class: 'secret-row' }, [stateText]));

    const action = ctx.secretAction || 'keep';
    const radios = el('div', { class: 'radio-group' });
    const replaceInput = el('input', {
      id,
      type: 'password',
      placeholder: 'New value',
      autocomplete: 'new-password',
      disabled: action !== 'replace',
      value: ctx.secretValue || '',
      oninput: (e) => ctx.onSecret(field.key, 'replace', e.target.value),
    });
    const mk = (val, text) => {
      const r = el('input', {
        type: 'radio', name: `sec-${field.key}`, checked: action === val, onchange: () => ctx.onSecret(field.key, val, val === 'replace' ? (ctx.secretValue || '') : undefined),
      });
      return el('label', {}, [r, text]);
    };
    radios.appendChild(mk('keep', ctx.secretSet ? 'Keep' : 'Leave unset'));
    radios.appendChild(mk('replace', 'Replace'));
    if (ctx.secretSet) radios.appendChild(mk('clear', 'Clear'));
    wrap.appendChild(radios);
    wrap.appendChild(replaceInput);
    wrap.appendChild(helpEl(field, ctx.error));
    return wrap;
  }

  // Labeled input row
  const label = el('label', { for: id, text: field.label });
  if (field.pinnable && ctx.pinned) {
    label.appendChild(el('span', { class: 'chip pinned', text: ` pinned by ${field.envVar}`, style: 'margin-left:8px' }));
  }
  wrap.appendChild(label);

  let input;
  if (field.type === 'select') {
    input = el('select', { id, onchange: (e) => ctx.onValue(field.key, e.target.value) });
    for (const opt of field.suggestions || []) {
      input.appendChild(el('option', { value: opt, text: opt, selected: opt === ctx.value }));
    }
  } else if (field.type === 'textarea') {
    input = el('textarea', { id, value: ctx.value || '', oninput: (e) => ctx.onValue(field.key, e.target.value) });
  } else {
    const type = field.type === 'number' || field.type === 'rate' ? 'number' : 'text';
    input = el('input', {
      id,
      type,
      value: ctx.value || '',
      placeholder: field.default || '',
      oninput: (e) => ctx.onValue(field.key, e.target.value),
    });
    if (field.suggestions && field.suggestions.length) {
      const dlid = `dl-${field.key}`;
      input.setAttribute('list', dlid);
      wrap.appendChild(datalist(dlid, field.suggestions));
    }
  }
  if (ctx.pinned) input.disabled = true;
  if (ctx.error) input.classList.add('invalid');
  wrap.appendChild(input);

  if (field.pinnable && ctx.pinned && ctx.value && ctx.value !== ctx.effective) {
    wrap.appendChild(el('div', { class: 'pinned-note', text: `Your saved value is ignored while ${field.envVar} is set in the environment.` }));
  }
  wrap.appendChild(helpEl(field, ctx.error));
  return wrap;
}
