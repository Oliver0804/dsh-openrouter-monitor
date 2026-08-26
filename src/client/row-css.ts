/**
 * One stylesheet keeping the OpenRouter row on a line of its own — the exact
 * contract documented in dsh-peak-pricing's row-css, pointed at this plugin's
 * attribute instead. Rules repeat `[data-slot]` to outrank the live-stats
 * merge stylesheet in either injection order; inert without it.
 *
 * @module dsh-openrouter-monitor/client/row-css
 */

export const ROW_CSS = `
div[data-slot="conversation.composer.dock"][data-slot]:has(> [data-dsh-openrouter-monitor]) {
  flex-wrap: wrap;
}

div[data-slot="conversation.composer.dock"][data-slot] > [data-dsh-openrouter-monitor] {
  flex: 0 0 100%;
  justify-content: center;
}
`.trim()

let injected = false

/** Inject the row stylesheet once; a no-op outside the browser. */
export function ensureRowCss(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  if (document.querySelector('style[data-dsh-openrouter-monitor-row]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshOpenrouterMonitorRow = ''
  style.textContent = ROW_CSS
  document.head.appendChild(style)
}
