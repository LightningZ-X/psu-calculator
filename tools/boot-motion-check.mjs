/* Shared narrow whitelist: both design and browser checks enforce the same contract. */
export const BOOT_NAMES = ['psu-boot-focus', 'psu-slice-lock', 'psu-cut-trace', 'psu-boot-line', 'psu-boot-tick', 'psu-page-in', 'psu-content-in', 'psu-ui-enter', 'psu-ui-feedback'];

export function checkBootMotion(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const errors = [];
  const names = [...css.matchAll(/@(?:-\w+-)?keyframes\s+([^\s{]+)/g)].map(m => m[1]);
  if (names.length !== BOOT_NAMES.length || new Set(names).size !== names.length ||
      names.some(n => !BOOT_NAMES.includes(n))) errors.push('keyframes 必须恰好匹配启动与交互白名单名称');
  if (/\binfinite\b/i.test(css)) errors.push('禁止 infinite');
  for (const m of css.matchAll(/cubic-bezier\(([^)]+)\)/g)) {
    const v = m[1].split(',').map(Number);
    if (v.length !== 4 || v.some(n => !Number.isFinite(n) || n < 0 || n > 1)) errors.push('禁止越界 cubic-bezier');
  }
  // Only the exact finite forms used here are allowed; var() cannot hide a name or repeat count.
  const forms = new Set([
    'psu-boot-focus 4.4s linear both', 'psu-boot-line 4.4s linear both',
    'psu-slice-lock .44s var(--ease) .4s both', 'psu-cut-trace .32s linear .52s both',
    'psu-boot-tick .4s linear 2.4s both', 'psu-page-in .6s linear both',
    'psu-content-in .36s var(--ease) var(--psu-boot-delay, 0ms) both',
    'psu-ui-enter .22s var(--ease) both', 'psu-ui-feedback .18s var(--ease) both',
    'none !important'
  ]);
  for (const m of css.matchAll(/(?:^|[;{])\s*((?:-\w+-)?animation(?:-[\w-]+)?)\s*:\s*([^;}]+)/g)) {
    const [, prop, raw] = m;
    const value = raw.trim().replace(/\s+/g, ' ');
    const ok = prop === 'animation' ? forms.has(value)
      : prop === 'animation-delay' ? ['2.8s', '3.2s'].includes(value)
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
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\*,\s*\*::before,\s*\*::after\s*\{\s*animation-duration:\s*\.001ms !important;\s*animation-iteration-count:\s*1 !important;\s*transition-duration:\s*\.001ms !important;/.test(css)) {
    errors.push('必须保留 reduced-motion 通配归零规则');
  }
  return errors;
}
