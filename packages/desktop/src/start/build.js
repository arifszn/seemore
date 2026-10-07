// The build sheet. `window.seemoreBuild` comes from the build preload.
const api = window.seemoreBuild;
const $ = (id) => document.getElementById(id);

const log = $('log');
api.onLog((text) => {
  log.hidden = false;
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
});

api.init().then((info) => {
  if (!info) return;
  $('root').textContent = info.root;
  $('out-dir').textContent = info.outDir;
  $('base').value = info.base === '/' ? '' : info.base;
  $('password-row').hidden = !info.auth;
});

$('choose').addEventListener('click', async () => {
  const outDir = await api.chooseFolder();
  if (outDir) $('out-dir').textContent = outDir;
});

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  for (const element of $('form').querySelectorAll('input, button')) element.disabled = true;
  log.textContent = '';
  const result = await api.start({ base: $('base').value, password: $('password').value });
  if (!result) return;
  $('result').hidden = false;
  $('status').textContent = result.code === 0 ? `Built into ${result.outDir}` : `The build failed (exit code ${result.code}).`;
  $('reveal').hidden = result.code !== 0;
  $('open-index').hidden = result.code !== 0 || !result.hasIndex;
});

$('reveal').addEventListener('click', () => api.reveal());
$('open-index').addEventListener('click', () => api.openIndex());
