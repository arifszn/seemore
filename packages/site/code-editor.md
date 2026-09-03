---
title: Code editor extension
description: The same rendered site as a panel beside your editor.
order: 3
---

# Code editor extension

Install seemore from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode) or [Open VSX](https://open-vsx.org/extension/arifszn/seemore-vscode) to get the same rendered site as a panel beside your editor. No terminal, no `npx`, no browser tab to manage. Open VSX also covers VS Code-compatible editors — Cursor, Antigravity, and others.

1. Open any Markdown file.
2. Click the seemore icon in the editor's title bar, or right-click a folder in the explorer and choose **Open Folder in seemore**.
3. The rendered site opens beside your editor, scoped to that file's folder.

The panel runs the same dev server as `npx seemore`, so everything about the live preview works here too — including [editing a page's text in place](./features.md): double-click a paragraph in the panel, hit **Save**, and the file beside you updates.

## Commands

| Command | Where | Does |
| --- | --- | --- |
| **Open in seemore** | Editor title bar, on any Markdown file | Renders that file's folder as a site |
| **Open Folder in seemore** | Explorer, right-click a folder | Renders that folder as a site and pins it as the root |
| **Pin Current Root** | Status bar item, while a site is open | Pins the currently-serving root for this workspace |

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `seemore.path` | *(bundled copy)* | Path to a `seemore` CLI entry point to use instead of the version bundled with the extension. Leave empty unless you're developing seemore itself. |
