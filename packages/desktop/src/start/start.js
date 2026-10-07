// The start screen. `window.seemore` comes from the start preload; the recents list arrives
// in the query string, so the page needs no fourth call to read it.
const api = window.seemore;

document.getElementById('open-folder').addEventListener('click', () => api.openFolder());
document.getElementById('open-file').addEventListener('click', () => api.openFile());

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
    const name = document.createElement('span');
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
