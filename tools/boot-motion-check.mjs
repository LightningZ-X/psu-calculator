/* Shared allowlist for startup, interaction and ambient motion. */
const namesAllowed = [
  'psu-content-in', 'psu-ui-enter', 'psu-ui-exit', 'psu-ui-feedback',
  'ambient-drift', 'intro-drift', 'result-drift', 'result-ready'
];
const ambientForms = new Map([
  ['ambient-drift 10s ease-in-out infinite alternate', '.site-lighting::before'],
  ['intro-drift 6s ease-in-out infinite alternate', '.page-intro::before'],
  ['result-drift 7s ease-in-out infinite alternate', '.reco:is([data-gradient-state="empty"], [data-gradient-state="partial"])::before']
]);

export function checkBootMotion(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const errors = [];
  const names = [...css.matchAll(/@(?:-\w+-)?keyframes\s+([^\s{]+)/g)].map(m => m[1]);
  if (names.length !== namesAllowed.length || new Set(names).size !== names.length ||
      names.some(n => !namesAllowed.includes(n))) errors.push('keyframes 必须恰好匹配动画白名单');
  const ambientMedia = /@media screen\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  const ambientBlocks = [...css.matchAll(ambientMedia)].map(m => m[1]);
  for (const [declaration, selector] of ambientForms) {
    const rules = ambientBlocks.flatMap(block => [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]);
    if (!rules.some(([, target, body]) => target.trim() === 'html:not([data-light-effects="off"]):not(.psu-boot-active):not(.psu-boot-pending) ' + selector &&
        body.trim() === 'animation: ' + declaration + ';')) errors.push('环境动画必须限定目标，并遵循光效开关');
  }
  const remaining = css.replace(ambientMedia, (block) => {
    for (const declaration of ambientForms.keys()) block = block.replace(declaration, '');
    return block;
  });
  if (/\binfinite\b/i.test(remaining)) errors.push('仅允许指定的环境动画使用 infinite');
  for (const m of css.matchAll(/cubic-bezier\(([^)]+)\)/g)) {
    const v = m[1].split(',').map(Number);
    if (v.length !== 4 || v.some(n => !Number.isFinite(n) || n < 0 || n > 1)) errors.push('禁止越界 cubic-bezier');
  }
  // Only the exact finite forms used here are allowed; var() cannot hide a name or repeat count.
  const forms = new Set([
    'psu-content-in .36s var(--ease) var(--psu-boot-delay, 0ms) both',
    'psu-ui-enter .32s var(--motion-enter) both', 'psu-ui-exit .18s var(--motion-exit) both',
    'psu-ui-feedback .18s var(--ease) both', 'none',
    'none !important', 'result-ready 700ms var(--motion-enter) both', ...ambientForms.keys()
  ]);
  for (const m of css.matchAll(/(?:^|[;{])\s*((?:-\w+-)?animation(?:-[\w-]+)?)\s*:\s*([^;}]+)/g)) {
    const [, prop, raw] = m;
    const value = raw.trim().replace(/\s+/g, ' ');
    const ok = prop === 'animation' ? forms.has(value)
      : prop === 'animation-duration' ? value === '.001ms !important'
      : prop === 'animation-iteration-count' ? value === '1 !important' : false;
    if (!ok) errors.push('动画声明不在白名单: ' + prop + ': ' + value);
  }
  for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    for (const body of m[1].matchAll(/\{([^{}]*)\}/g)) {
      if (body[1].split(';').filter(s => s.trim()).some(s => !/^\s*(opacity|transform)\s*:/.test(s))) {
        errors.push('关键帧只允许 opacity / transform');
      }
    }
  }
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\*,\s*:not\(\[data-ambient-light\]\)::before,\s*\*::after\s*\{\s*animation-duration:\s*\.001ms !important;\s*animation-iteration-count:\s*1 !important;\s*transition-duration:\s*\.001ms !important;/.test(css)) {
    errors.push('必须保留 reduced-motion 通配归零规则');
  }
  return errors;
}
