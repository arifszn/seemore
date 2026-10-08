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

let recents = [];
try {
  recents = JSON.parse(new URLSearchParams(location.search).get('recents') || '[]');
} catch {
  recents = [];
}

if (recents.length > 0) {
  const list = document.getElementById('recent-list');
  for (const entry of recents) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.title = entry.path;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.path.split(/[\\/]/).filter(Boolean).pop() || entry.path;
    const path = document.createElement('span');
    path.className = 'path';
    path.textContent = entry.path;
    button.append(name, path);
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
