# seemore

Read a folder of Markdown as a rendered site — without leaving VS Code.

[![Version](https://img.shields.io/visual-studio-marketplace/v/arifszn.seemore-vscode)](https://marketplace.visualstudio.com/items?itemName=arifszn.seemore-vscode)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-informational)](https://github.com/arifszn/seemore/blob/main/LICENSE)

AI tools write Markdown fast — specs, notes, guides, whole folders of it. Reading it back
one raw `.md` file at a time is the slow part. This extension puts a button on the file
you're already looking at: click it, and the folder around that file opens as a real
rendered site — navigation, search and a clean reading layout — right next to your editor.

No terminal, no `npx`, no browser tab to manage. It's [seemore](https://www.npmjs.com/package/seemore),
the open-source CLI, running as a child process VS Code owns for you.

## Getting started

1. Open any Markdown file.
2. Click the seemore icon in the editor's title bar (or right-click a folder in the
   explorer and choose **Open Folder in seemore**).
3. The rendered site opens beside your editor, scoped to that file's folder.

Clicking the icon on a different file swaps the panel to that file's site — the old
server is stopped and a fresh one starts for the new folder, so what you see always
matches the file you clicked from.

## What you get

- **The real seemore experience, in a panel.** Full navigation, instant page loads,
  built-in search — the same rendering engine as `npx seemore`, not a stripped-down
  preview.
- **Scoped to where you're standing.** Click a file inside `docs/guide/`, see the site
  rooted at `docs/guide/` — not your whole repo. Root resolution follows the same rule as
  the CLI: nearest `seemore.config.ts` wins, otherwise the clicked file's own folder.
- **A folder-level entry point too.** Right-click any folder in the explorer to open it
  directly, no file click required.
- **Pin a root.** Once a site is open, click the seemore item in the status bar to pin its
  root — future clicks anywhere in the workspace use that root instead of re-resolving it.
- **Never steals focus.** The panel opens beside your editor without pulling focus away
  from what you're typing, and its editor group is locked so ordinary file-opens keep
  landing where you'd expect.

## Commands

| Command | Where | Does |
| --- | --- | --- |
| **Open in seemore** | Editor title bar, on any Markdown file | Renders that file's folder as a site |
| **Open Folder in seemore** | Explorer, right-click a folder | Renders that folder as a site and pins it as the root |
| **Pin Current Root** | Status bar item, while a site is open | Pins the currently-serving root for this workspace |

## Configuration

Optional. seemore works with zero configuration — the same folder that builds cleanly
with the CLI opens cleanly here.

To customise the site (title, theme, navigation, etc.), add a `seemore.config.ts` next to
your content — see the [seemore configuration reference](https://www.npmjs.com/package/seemore#configuration)
for every option.

| Setting | Default | Effect |
| --- | --- | --- |
| `seemore.path` | *(bundled copy)* | Path to a `seemore` CLI entry point to use instead of the version bundled with the extension. For developing seemore itself — leave empty otherwise. |

## Requirements

Nothing to install separately — the `seemore` CLI ships bundled inside the extension.

## Under the hood

Built on [seemore](https://github.com/arifszn/seemore), the open-source CLI for reading
folders of Markdown as a site. Bug reports and pull requests are welcome at
[github.com/arifszn/seemore](https://github.com/arifszn/seemore).

## Licence

[MIT](https://github.com/arifszn/seemore/blob/main/LICENSE)
