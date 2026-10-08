// The splitter (DESKTOP-SPEC §7.4): the page reports the pointer, the main process resizes.
const splitter = document.getElementById('splitter');
// A cancelled pointer reports no position of its own; the drag ends where it last was.
let lastY = 0;

splitter.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  splitter.setPointerCapture(event.pointerId);
  splitter.classList.add('dragging');
  lastY = event.screenY;
  window.seemore.drag('start', lastY);
});
splitter.addEventListener('pointermove', (event) => {
  if (!splitter.hasPointerCapture(event.pointerId)) return;
  lastY = event.screenY;
  window.seemore.drag('move', lastY);
});
const end = (event) => {
  if (!splitter.classList.contains('dragging')) return;
  splitter.classList.remove('dragging');
  if (event.type === 'pointerup') lastY = event.screenY;
  window.seemore.drag('end', lastY);
};
splitter.addEventListener('pointerup', end);
splitter.addEventListener('pointercancel', end);
