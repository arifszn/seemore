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
  maximize: () => void;
  copy: (text: string) => void;
  paste: () => void;
  openLink: (url: string) => void;
  onData: (listener: (id: number, data: string) => void) => void;
  onExit: (listener: (id: number, exitCode: number) => void) => void;
  onCommand: (listener: (command: string) => void) => void;
  onTheme: (listener: (dark: boolean) => void) => void;
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

const osDark = matchMedia('(prefers-color-scheme: dark)');
/** The site's theme, once the main process has sent it; the OS's until then. */
let siteDark: boolean | undefined;

function theme(): ITheme {
  // Resolved colours: start.css's tokens are `light-dark()` pairs, unresolved as properties.
  const body = getComputedStyle(document.body);
  const dark = siteDark ?? osDark.matches;
  return {
    ...(dark ? ANSI.dark : ANSI.light),
    background: body.backgroundColor,
    foreground: body.color,
    cursor: body.color,
    cursorAccent: body.backgroundColor,
    selectionBackground: dark ? 'rgba(124, 156, 255, 0.3)' : 'rgba(47, 91, 211, 0.25)',
  };
}

function applyTheme(): void {
  if (siteDark !== undefined) document.documentElement.style.colorScheme = siteDark ? 'dark' : 'light';
  const next = theme();
  for (const session of sessions.values()) session.term.options.theme = next;
}
osDark.addEventListener('change', applyTheme);

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
  // Not xterm's, and not stopped: unhandled, it reaches the menu's accelerator.
  if (action.kind === 'menu') return false;
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
  host.className = 'terminal-host';
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

  // None when the shell can't start; the main process has said why.
  const created = await api.create(term.cols, term.rows).catch(() => undefined);
  if (created === undefined) {
    term.dispose();
    host.remove();
    if (sessions.size === 0) api.hide();
    return;
  }
  const tab = document.createElement('li');
  tab.setAttribute('role', 'tab');
  tab.draggable = true;
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
  reorderable(session);
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
  // Text in the field selects by dragging, rather than moving the tab.
  session.tab.draggable = false;
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
    session.tab.draggable = true;
    session.term.focus();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// Reordering (as VS Code's tabs list): drag a terminal above or below another. The order is
// the tabs list's, which Focus Previous and Next follow.
let dragged: Session | undefined;

function dropSide(tab: HTMLElement, event: DragEvent): 'before' | 'after' {
  const box = tab.getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
}

function clearDrop(): void {
  for (const tab of Array.from(tabsEl.children)) tab.classList.remove('drop-before', 'drop-after');
}

function reorderable(session: Session): void {
  const { tab } = session;
  tab.addEventListener('dragstart', (event) => {
    dragged = session;
    tab.classList.add('dragged');
    event.dataTransfer?.setData('text/plain', session.name);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  tab.addEventListener('dragend', () => {
    dragged = undefined;
    tab.classList.remove('dragged');
    clearDrop();
  });
  tab.addEventListener('dragover', (event) => {
    if (dragged === undefined || dragged === session) return;
    event.preventDefault();
    clearDrop();
    tab.classList.add(`drop-${dropSide(tab, event)}`);
  });
  tab.addEventListener('dragleave', () => tab.classList.remove('drop-before', 'drop-after'));
  tab.addEventListener('drop', (event) => {
    if (dragged === undefined || dragged === session) return;
    event.preventDefault();
    const side = dropSide(tab, event);
    clearDrop();
    if (side === 'before') tab.before(dragged.tab);
    else tab.after(dragged.tab);
    // The sessions follow the list, so Focus Previous and Next go by what is shown.
    const order = Array.from(tabsEl.children);
    const sorted = [...sessions.values()].sort((a, b) => order.indexOf(a.tab) - order.indexOf(b.tab));
    sessions.clear();
    for (const each of sorted) sessions.set(each.id, each);
    dragged.term.focus();
  });
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
const maximizeButton = $('maximize');
/** The chevron points at what clicking will do, as VS Code's titles do. */
function setMaximizeLabel(maximized: boolean): void {
  maximizeButton.title = maximized ? 'Restore Panel Size' : 'Maximize Panel Size';
  maximizeButton.setAttribute('aria-label', maximizeButton.title);
}
$('maximize').addEventListener('click', () => api.maximize());

api.onData((id, data) => sessions.get(id)?.term.write(data));
api.onExit((id) => remove(id));
api.onTheme((dark) => {
  siteDark = dark;
  applyTheme();
});
api.onCommand((command) => {
  switch (command) {
    // The panel opened: a shell if it has none, and focus on the active one.
    case 'opened':
      // Once: a second `opened` can arrive while the first shell is still starting.
      if (sessions.size === 0 && creating === undefined) void create();
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
    // The panel's chevron state, pushed by the main process: only it knows the splitter's grab.
    case 'maximized':
      document.body.classList.add('maximized');
      setMaximizeLabel(true);
      break;
    case 'restored':
      document.body.classList.remove('maximized');
      setMaximizeLabel(false);
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
