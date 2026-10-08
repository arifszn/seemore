/**
 * The terminal panel's page (DESKTOP-SPEC §7.4): one xterm per shell, the active one on the
 * left, the tabs list on the right once there are two. Shells live in the main process; this
 * page only draws them and passes keys through the preload.
 */
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { type ITheme, Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
import { keyAction } from './keys.js';

interface Api {
  platform: string;
  drag: (phase: 'start' | 'move' | 'end', screenY: number) => void;
  create: (cols: number, rows: number) => Promise<{ id: number; name: string } | undefined>;
  input: (id: number, data: string) => void;
  resize: (id: number, cols: number, rows: number) => void;
  rename: (id: number, name: string) => void;
  kill: (id: number) => void;
  hide: () => void;
  copy: (text: string) => void;
  paste: () => void;
  openLink: (url: string) => void;
  onData: (listener: (id: number, data: string) => void) => void;
  onExit: (listener: (id: number, exitCode: number) => void) => void;
  onCommand: (listener: (command: string) => void) => void;
}

interface Session {
  id: number;
  name: string;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  host: HTMLElement;
  tab: HTMLLIElement;
}

const api = (window as unknown as { seemore: Api }).seemore;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const terminalsEl = $<HTMLElement>('terminals');
const tabsEl = $<HTMLUListElement>('tabs');
const findEl = $<HTMLFormElement>('find');
const findInput = $<HTMLInputElement>('find-input');
const findStatus = $<HTMLElement>('find-status');

const sessions = new Map<number, Session>();
let active: Session | undefined;
/** A create in flight: a second "+" waits for it rather than racing. */
let creating: Promise<void> | undefined;

/**
 * VS Code's terminal ANSI colours, light and dark (`terminalColorRegistry.ts` in
 * microsoft/vscode, read 2026-10-08): xterm's own defaults are for a dark background.
 */
const ANSI = {
  light: {
    black: '#000000', red: '#cd3131', green: '#107C10', yellow: '#949800',
    blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#14CE14', brightYellow: '#b5ba00',
    brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#a5a5a5',
  },
  dark: {
    black: '#000000', red: '#cd3131', green: '#0DBC79', yellow: '#e5e510',
    blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
    brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5',
  },
} satisfies Record<string, ITheme>;

const dark = matchMedia('(prefers-color-scheme: dark)');

function theme(): ITheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ...(dark.matches ? ANSI.dark : ANSI.light),
    background: v('--bg'),
    foreground: v('--fg'),
    cursor: v('--fg'),
    cursorAccent: v('--bg'),
    selectionBackground: v('--selection'),
  };
}

dark.addEventListener('change', () => {
  const next = theme();
  for (const session of sessions.values()) session.term.options.theme = next;
});

function fitActive(): void {
  if (active === undefined || active.host.hidden) return;
  try {
    active.fit.fit();
  } catch {
    // Not laid out yet; the next resize fits it.
  }
}
new ResizeObserver(() => fitActive()).observe(terminalsEl);

function render(): void {
  document.body.classList.toggle('many', sessions.size > 1);
  for (const session of sessions.values()) {
    const current = session === active;
    session.host.hidden = !current;
    session.tab.classList.toggle('active', current);
    session.tab.setAttribute('aria-selected', String(current));
  }
}

function activate(session: Session | undefined): void {
  active = session;
  render();
  fitActive();
  active?.term.focus();
}

function runKey(session: Session, event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return true;
  const action = keyAction(event, api.platform, session.term.hasSelection());
  if (action === undefined) return true;
  // Handled here: neither xterm nor a menu accelerator should see it too.
  event.preventDefault();
  if (action.kind === 'find') openFind();
  else if (action.kind === 'copy') api.copy(session.term.getSelection());
  else if (action.kind === 'paste') api.paste();
  else if ('to' in action) {
    if (action.to === 'top') session.term.scrollToTop();
    else session.term.scrollToBottom();
  } else if (action.by === 'line') session.term.scrollLines(action.amount);
  else session.term.scrollPages(action.amount);
  return false;
}

async function createNow(): Promise<void> {
  const host = document.createElement('div');
  host.className = 'terminal';
  terminalsEl.append(host);
  const term = new Terminal({
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
    fontSize: api.platform === 'darwin' ? 12 : 14,
    scrollback: 1000,
    // VS Code's default: colours are nudged until they reach WCAG AA contrast on the background.
    minimumContrastRatio: 4.5,
    theme: theme(),
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon((_event, uri) => api.openLink(uri)));
  term.open(host);
  try {
    fit.fit();
  } catch {
    // Created while hidden: 80 by 24 until the first resize.
  }

  const created = await api.create(term.cols, term.rows);
  if (created === undefined) {
    term.dispose();
    host.remove();
    return;
  }
  const tab = document.createElement('li');
  tab.setAttribute('role', 'tab');
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = created.name;
  const trash = document.createElement('button');
  trash.className = 'kill';
  trash.title = 'Kill Terminal';
  trash.setAttribute('aria-label', 'Kill Terminal');
  tab.append(label, trash);
  tabsEl.append(tab);

  const session: Session = { id: created.id, name: created.name, term, fit, search, host, tab };
  sessions.set(created.id, session);
  term.onData((data) => api.input(session.id, data));
  term.onResize(({ cols, rows }) => api.resize(session.id, cols, rows));
  term.attachCustomKeyEventHandler((event) => runKey(session, event));
  tab.addEventListener('click', (event) => {
    if (event.target !== trash) activate(session);
  });
  tab.addEventListener('dblclick', (event) => {
    if (event.target !== trash) startRename(session);
  });
  trash.addEventListener('click', () => api.kill(session.id));
  activate(session);
}

function create(): Promise<void> {
  creating = (creating ?? Promise.resolve()).then(createNow).finally(() => (creating = undefined));
  return creating;
}

function remove(id: number): void {
  const session = sessions.get(id);
  if (session === undefined) return;
  sessions.delete(id);
  session.term.dispose();
  session.host.remove();
  session.tab.remove();
  if (active === session) activate([...sessions.values()].at(-1));
  else render();
}

function startRename(session: Session): void {
  const label = session.tab.querySelector<HTMLElement>('.name');
  if (label === null || session.tab.querySelector('input') !== null) return;
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = session.name;
  label.replaceWith(input);
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (save && name !== '') {
      session.name = name;
      api.rename(session.id, name);
    }
    label.textContent = session.name;
    input.replaceWith(label);
    session.term.focus();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function step(by: 1 | -1): void {
  const list = [...sessions.values()];
  if (list.length < 2 || active === undefined) return;
  activate(list[(list.indexOf(active) + by + list.length) % list.length]);
}

// Find (Cmd/Ctrl+F): over the active terminal; Enter for next, Shift+Enter for previous.
function openFind(): void {
  findEl.hidden = false;
  findInput.select();
  findInput.focus();
}

function closeFind(): void {
  findEl.hidden = true;
  findStatus.textContent = '';
  active?.search.clearActiveDecoration();
  active?.term.focus();
}

function find(backwards: boolean): void {
  if (active === undefined || findInput.value === '') {
    findStatus.textContent = '';
    return;
  }
  const found = backwards ? active.search.findPrevious(findInput.value) : active.search.findNext(findInput.value);
  findStatus.textContent = found ? '' : 'No results';
}

findEl.addEventListener('submit', (event) => event.preventDefault());
findInput.addEventListener('input', () => find(false));
findInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') find(event.shiftKey);
  if (event.key === 'Escape') closeFind();
});
$('find-prev').addEventListener('click', () => find(true));
$('find-next').addEventListener('click', () => find(false));
$('find-close').addEventListener('click', () => closeFind());

$('new').addEventListener('click', () => void create());
$('kill-active').addEventListener('click', () => {
  if (active !== undefined) api.kill(active.id);
});
$('hide').addEventListener('click', () => api.hide());

api.onData((id, data) => sessions.get(id)?.term.write(data));
api.onExit((id) => remove(id));
api.onCommand((command) => {
  switch (command) {
    // The panel opened: a shell if it has none, and focus on the active one.
    case 'opened':
      if (sessions.size === 0) void create();
      else activate(active);
      break;
    case 'new':
      void create();
      break;
    case 'kill':
      if (active !== undefined) api.kill(active.id);
      break;
    case 'rename':
      if (active !== undefined) startRename(active);
      break;
    case 'clear':
      active?.term.clear();
      break;
    case 'previous':
      step(-1);
      break;
    case 'next':
      step(1);
      break;
  }
});

// The splitter: the page reports the pointer in screen coordinates, the main process resizes.
const splitter = $('splitter');
// A cancelled pointer reports no position of its own; the drag ends where it last was.
let lastY = 0;
splitter.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  splitter.setPointerCapture(event.pointerId);
  splitter.classList.add('dragging');
  lastY = event.screenY;
  api.drag('start', lastY);
});
splitter.addEventListener('pointermove', (event) => {
  if (!splitter.hasPointerCapture(event.pointerId)) return;
  lastY = event.screenY;
  api.drag('move', lastY);
});
const endDrag = (event: PointerEvent) => {
  if (!splitter.classList.contains('dragging')) return;
  splitter.classList.remove('dragging');
  if (event.type === 'pointerup') lastY = event.screenY;
  api.drag('end', lastY);
};
splitter.addEventListener('pointerup', endDrag);
splitter.addEventListener('pointercancel', endDrag);
