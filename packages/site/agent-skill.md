---
title: Agent skill
description: Let an AI agent install seemore, write pages, run the preview, build and publish.
---

# Agent skill

The [seemore agent skill](https://github.com/arifszn/seemore-skill) teaches an AI agent to run seemore for you. You describe what you want, and the agent runs the commands:

- starts the live preview on your folder, or sets up a new docs folder when you have none
- writes, edits and reorders pages, using the Markdown syntax seemore supports
- changes the theme, title and other settings in `seemore.config.ts`
- builds the static site and publishes it to GitHub Pages, Netlify, Cloudflare Pages, Surge or Vercel, optionally behind a password
- reads build errors and fixes the file they name

The skill works in Claude Code and in any agent that supports the `SKILL.md` format, such as Codex, OpenCode, Antigravity, Gemini CLI and Cursor.

## Install

### Claude Code

```bash
/plugin marketplace add arifszn/seemore-skill
```

```bash
/plugin install seemore
```

### Other agents

Paste this to your agent:

```
Fetch and follow the install instructions from
https://raw.githubusercontent.com/arifszn/seemore-skill/refs/heads/main/INSTALL.md
```

Or install it yourself: [INSTALL.md](https://github.com/arifszn/seemore-skill/blob/main/INSTALL.md) has the skills folder for each agent.

## Use it

Describe the result you want:

```
Turn this folder of notes into a docs site I can read in my browser
```

```
Add a page about how deploys work, and put it after the getting-started page
```

```
Publish this to GitHub Pages behind a password
```

Or call the skill by name:

```
/seemore
```

The agent needs [Node.js](https://nodejs.org) 22 or newer on your machine. If Node is missing, the skill tells you, because installing it is the one step it does not do for you. Publishing can also need a one-time login to the host, which you do in your own terminal.
