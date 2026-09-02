---
title: Content
description: What seemore renders, and how pages get their addresses.
order: 5
---

# Content

`.md` and `.mdx` alike, with the format inferred per file, so plain Markdown never needs MDX syntax.

- GitHub Flavoured Markdown, admonitions (note / tip / warning boxes), step-by-step lists, and colour-highlighted code blocks
- `[[wikilinks]]`, including `[[Page|label]]` and `[[Page#Heading]]`, the easiest way for you or your AI to link pages without relative paths to get right
- Relative `.md` links are resolved to working links automatically
- **[Mermaid](https://mermaid.js.org)** and **[D2](https://d2lang.com)** diagrams, both rendered live in the browser straight from a ` ```mermaid ` or ` ```d2 ` code fence
- Sibling images inlined as hashed assets, sibling PDFs open in the browser's own viewer
- Frontmatter (the `key: value` block at the top of a file) is validated, with errors that name the file and the field

## Page addresses

| File | Address |
| --- | --- |
| `index.md` | `/` |
| `README.md` (root) | `/` |
| `getting-started.md` | `/getting-started` |
| `guide/index.md` | `/guide` |
| `guide/Deep Dive.md` | `/guide/deep-dive` |

Both `/guide` and `/guide/` work on every host.

## Ordering

Pages are ordered by:

1. `meta.json` in the directory
2. Frontmatter `order`
3. Alphabetical by title
