// A site window's page while its server starts (DESKTOP-SPEC §5). The root's name arrives in
// the query string.
const name = new URLSearchParams(location.search).get('name');
if (name) document.getElementById('label').textContent = `Opening ${name}…`;
