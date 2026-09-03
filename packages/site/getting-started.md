---
title: Getting started
description: View a folder of Markdown rendered in your browser, live.
order: 2
---

# Getting started

```bash
npx seemore     # view the current folder in your browser, live, no setup
```

Open a terminal in your folder of Markdown files, run `npx seemore`, and open the address it prints (`http://localhost:4040` by default). From there it's live: add, rename, retitle or delete a file and the site updates immediately, navigation included.

With no folder given, seemore serves the folder you're standing in. Point it at a subfolder with `npx seemore docs` if that's where your files live.

The page in front of you is also an editor. Double-click any paragraph, heading, list item or table cell and its **Markdown source** opens in place — fix it, hit **Save**, and the change is written back to the file, everything around it untouched. It is the shortest path from spotting a wrong sentence to having it fixed; see [Features](./features.md) for the details.

See the [CLI reference](./cli-reference.md) for every flag.
