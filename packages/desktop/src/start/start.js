// The start screen. `window.seemore` comes from the start preload; the recents list arrives
// in the query string, so the page needs no fourth call to read it.
const api = window.seemore;

document.getElementById('open-folder').addEventListener('click', () => api.openFolder());
document.getElementById('open-file').addEventListener('click', () => api.openFile());

// The buttons show the menu's accelerators (menu.ts), spelled for this platform.
const mac = /Mac/.test(navigator.platform);
for (const kbd of document.querySelectorAll('kbd[data-keys]')) {
  const keys = kbd.dataset.keys.split('+');
  kbd.textContent = mac
    ? '⌘' + keys.map((key) => (key === 'shift' ? '⇧' : key.toUpperCase())).join('')
    : ['Ctrl', ...keys.map((key) => (key === 'shift' ? 'Shift' : key.toUpperCase()))].join('+');
}

const query = new URLSearchParams(location.search);
let recents = [];
try {
  recents = JSON.parse(query.get('recents') || '[]');
} catch {
  recents = [];
}

// The home directory, shown as `~`. The main process passes it; without it, paths show as is.
const home = query.get('home') || '';
const tilde = (path) =>
  home && (path === home || path.startsWith(home + '/') || path.startsWith(home + '\\'))
    ? '~' + path.slice(home.length)
    : path;

const ICONS = {
  folder: '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/>',
  file: '<path d="M4 1.75h5.25L12.5 5v9.25H4z"/><path d="M9.25 1.75V5h3.25"/>',
};
const icon = (kind) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[kind] || ICONS.file;
  return svg;
};

if (recents.length > 0) {
  const list = document.getElementById('recent-list');
  for (const entry of recents) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.title = entry.path;
    // The last segment is the name; what comes before it is the parent folder.
    const trimmed = entry.path.replace(/(.)[\\/]+$/, '$1');
    const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = trimmed.slice(cut + 1) || entry.path;
    const parent = document.createElement('span');
    parent.className = 'path';
    parent.textContent = cut < 0 ? '' : tilde(trimmed.slice(0, cut) || trimmed.slice(0, 1));
    button.append(icon(entry.kind), name, parent);
    button.addEventListener('click', () => api.openRecent(entry.path));
    item.append(button);
    list.append(item);
  }
  document.getElementById('recents').hidden = false;
}

// Highlight the window while something is dragged over it. The drop is not handled here:
// the browser's default opens it, and the main process takes that as a path (policy.ts).
let depth = 0;
const setDragging = (on) => document.body.classList.toggle('dragging', on);
addEventListener('dragenter', () => setDragging(++depth > 0));
addEventListener('dragleave', () => setDragging(--depth > 0));
addEventListener('drop', () => setDragging((depth = 0) > 0));

// Fade the list's bottom edge while more of it is below.
const recentList = document.getElementById('recent-list');
const markMore = () => recentList.classList.toggle('more', recentList.scrollTop + recentList.clientHeight < recentList.scrollHeight - 1);
recentList.addEventListener('scroll', markMore, { passive: true });
addEventListener('resize', markMore);
markMore();
