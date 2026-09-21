import type { ShellColours } from './theme.js';

export interface LockShellOptions {
  title: string;
  description?: string;
  base: string;
  /** Resolved `href` of the icon: the configured favicon, or seemore's own. */
  favicon?: string;
  colours: ShellColours;
  /** The bundled lock-screen script. */
  script: string;
}

/**
 * The lock shell: `index.html`, `404.html` and `200.html` of a protected build, and what the
 * worker answers a locked navigation with. Self-contained — inline CSS and JS, nothing from
 * the app bundle — and it carries the site title, description and favicon, and nothing else.
 */
export function renderLockShell(options: LockShellOptions): string {
  const title = escapeHtml(options.title);
  const icon = options.favicon === undefined ? undefined : escapeHtml(options.favicon);
  const config = JSON.stringify({ base: options.base }).replace(/</g, '\\u003c');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    // Search engines: nothing past this screen is readable to them anyway.
    '<meta name="robots" content="noindex, nofollow" />',
    `<title>${title}</title>`,
    options.description === undefined ? '' : `<meta name="description" content="${escapeHtml(options.description)}" />`,
    icon === undefined ? '' : `<link rel="icon" href="${icon}" />`,
    `<style>${styles(options.colours)}</style>`,
    `<script>${inlineScript(THEME_SCRIPT)}</script>`,
    '</head>',
    '<body>',
    '<main class="lock">',
    icon === undefined ? '' : `<img class="lock-icon" src="${icon}" alt="" width="44" height="44" />`,
    `<h1>${title}</h1>`,
    options.description === undefined ? '' : `<p class="lock-desc">${escapeHtml(options.description)}</p>`,
    '<form id="seemore-auth-form" hidden>',
    '<label class="lock-label" for="seemore-auth-password">Password</label>',
    '<input id="seemore-auth-password" name="password" type="password" placeholder="Password" autocomplete="current-password" required />',
    '<button id="seemore-auth-submit" type="submit">Unlock</button>',
    '<p id="seemore-auth-status" class="lock-status" role="alert"></p>',
    '</form>',
    `<p id="seemore-auth-unsupported" class="lock-note" hidden>This browser can't unlock this site — it needs service workers. Try a regular (not private) window or another browser.</p>`,
    '<noscript><p class="lock-note">This site needs JavaScript to unlock.</p></noscript>',
    '</main>',
    `<script type="application/json" id="seemore-auth-config">${config}</script>`,
    `<script>${inlineScript(options.script)}</script>`,
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Dark or light the way the app would render: the choice it stored (next-themes' `theme`
 * key), else the system preference.
 */
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";

function styles(colours: ShellColours): string {
  const vars = (tokens: Record<string, string>) =>
    Object.entries(tokens)
      .map(([name, value]) => `--${name}:${value}`)
      .join(';');

  return [
    `:root{color-scheme:light;${vars(colours.light)}}`,
    `:root.dark{color-scheme:dark;${vars(colours.dark)}}`,
    '*{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    'html,body{min-height:100%}',
    'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--background);color:var(--foreground);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lock{width:100%;max-width:360px;padding:32px;border:1px solid color-mix(in srgb,var(--foreground) 12%,transparent);border-radius:8px;background:color-mix(in srgb,var(--background) 94%,var(--foreground));box-shadow:0 12px 32px color-mix(in srgb,var(--foreground) 8%,transparent);text-align:center;animation:lock-in .24s ease-out both}',
    ':root:not(.dark) .lock{background:color-mix(in srgb,var(--background) 92%,white)}',
    '.lock-icon{width:40px;height:40px;margin-bottom:20px}',
    'h1{margin:0;font-size:22px;line-height:1.2;font-weight:650;letter-spacing:-.015em}',
    '.lock-site{margin:7px 0 0;color:var(--muted-foreground);font-size:14px}',
    '.lock-desc{margin:6px 0 0;font-size:14px;color:var(--muted-foreground)}',
    'form{width:100%;margin-top:24px;text-align:left}',
    '.lock-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    'input{display:block;width:100%;min-width:0;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--background);color:inherit}',
    'input:focus{outline:2px solid var(--ring);outline-offset:2px}',
    'button{display:block;width:100%;margin-top:18px;font:inherit;font-weight:600;padding:10px 16px;border:0;border-radius:8px;background:var(--primary);color:var(--primary-foreground);cursor:pointer}',
    'button:disabled{opacity:.6;cursor:progress}',
    '.lock-status{margin:10px 0 0;min-height:1.5em;font-size:14px;color:var(--error)}',
    '.lock-note{margin:14px 0 0;font-size:14px;color:var(--muted-foreground);max-width:34ch}',
    '.lock-shake{animation:lock-shake .3s ease-in-out}',
    '@keyframes lock-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes lock-shake{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}',
    '@media (max-width:400px){.lock{padding:24px}}',
    '@media (prefers-reduced-motion:reduce){.lock,.lock-shake{animation:none}}',
  ].join('\n');
}

/** A script body is raw text to the HTML parser: only `</script` can end it early. */
function inlineScript(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
