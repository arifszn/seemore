import { defineConfig } from 'seemore';

export default defineConfig({
  title: 'seemore',
  description: 'Let AI write the Markdown. Let seemore show it better.',
  base: '/seemore/',
  theme: 'neutral',
  nav: [
    { text: 'GitHub', link: 'https://github.com/arifszn/seemore' },
    { text: 'npm', link: 'https://www.npmjs.com/package/seemore' },
    {
      text: 'VS Code',
      link: 'https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode',
    },
  ],
  footer: { text: '© 2026 seemore. MIT Licensed.' },
  editLink: {
    base: 'https://github.com/arifszn/seemore/edit/main/packages/site',
  },
});
