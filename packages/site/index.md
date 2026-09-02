---
title: seemore
description: Let AI write the Markdown. Let seemore show it better.
order: 1
---

<img src="https://raw.githubusercontent.com/arifszn/seemore/main/packages/vscode/assets/icon.png" alt="seemore" width="96" height="96">

# seemore

Let AI write the Markdown. Let seemore show it better.

[![npm version](https://img.shields.io/npm/v/seemore)](https://www.npmjs.com/package/seemore)
[![VS Code Marketplace](https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode)
[![CI](https://github.com/arifszn/seemore/actions/workflows/ci.yml/badge.svg)](https://github.com/arifszn/seemore/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-informational)](https://github.com/arifszn/seemore/blob/main/LICENSE)

AI tools write Markdown — specs, notes, guides, READMEs, whole folders of it, faster than
anyone can read. A pile of `.md` files is write-only memory: nothing to click, nothing to
search, no order.

seemore points at that folder and renders it as a proper site instead, without you moving a single file or writing any code. This site is one: every page here is a plain Markdown file, rendered by `seemore build`.

## Three ways to use it

- **[In your browser](./getting-started.md)**: `npx seemore` serves the folder you're standing in and updates live as you edit.
- **[In VS Code](./vscode.md)**: an extension puts the same site in a panel next to the file you're editing.
- **[As a static site](./publishing.md)**: `npx seemore build` exports plain HTML you can host anywhere, so it doubles as a docs framework, not just a preview tool.

## Under the hood

[fumadocs](https://fumadocs.vercel.app) provides the interface presets, with [Shiki](https://shiki.style), [Mermaid](https://mermaid.js.org), [Vite](https://vite.dev) and [React Router](https://reactrouter.com) underneath. Bug reports and pull requests are welcome at [github.com/arifszn/seemore](https://github.com/arifszn/seemore).

## Licence

[MIT](https://github.com/arifszn/seemore/blob/main/LICENSE)
