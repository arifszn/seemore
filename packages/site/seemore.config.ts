import { defineConfig } from 'seemore';

export default defineConfig({
  title: 'seemore',
  description: 'Let AI write the Markdown. Let seemore show it better — zero config documentation framework.',
  base: '/seemore/',
  theme: 'neutral',
  nav: [{ text: 'GitHub', link: 'https://github.com/arifszn/seemore' }],
  footer: { text: '© 2026 seemore. MIT Licensed.' },
  editLink: {
    base: 'https://github.com/arifszn/seemore/edit/main/packages/site',
  },
});
