---
title: Getting started
description: First steps.
order: 1
---

# Getting started

Install it, point it at a folder, done. See the [guide](./guide/index.md).

```ts
import { defineConfig } from 'seemore';

export default defineConfig({ title: 'My Docs' });
```

```mermaid
graph TD;
  A[Markdown] --> B[seemore];
  B --> C[Static site];
```

```d2
Markdown -> seemore -> Static site
```
