/**
 * The site view's preload (DESKTOP-SPEC §7.4, §8): exposes nothing to the page. It reports
 * one bit, whether the site shows dark (the `dark` class next-themes leaves on `<html>`), so
 * the window's terminal can match the site's theme toggle.
 */
import { ipcRenderer } from 'electron';

let last: boolean | undefined;
function report(): void {
  const dark = document.documentElement.classList.contains('dark');
  if (dark === last) return;
  last = dark;
  ipcRenderer.send('site:theme', dark);
}

window.addEventListener('DOMContentLoaded', () => {
  report();
  new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});
