---
title: CLI reference
description: Every seemore command and flag.
order: 9
---

# CLI reference

```
seemore [dir]           start the dev server
seemore build [dir]     build a static site into dist/
seemore export <file>   export a page as a standalone HTML file

Options
  --port <number>        dev server port (default 4040)
  --host [host]          expose the dev server on the network
  --open / --no-open     open a browser on start (default: no)
  --json                 print one machine-readable JSON line instead of the summary (dev only)
  --config <path>        path to seemore.config.ts
  --out <dir>            build output directory (default: dist); for export, where the HTML file is written
  --base <path>          subpath the site is served from, e.g. /my-repo/
  -h, --help             show this message
  -v, --version          show the version
```

`seemore export` renders the page you name and writes one self-contained HTML file next to it
(`--out <dir>` chooses a different folder). It needs no browser: diagrams are rendered when the
exported file is opened. The file is the same one the site's **Actions → Export as HTML** button
produces, and exporting is refused when `pageActions` leaves out `'export-html'`.

## Password protection

When `auth` is set in `seemore.config.ts`, `seemore build` reads the password from the
`SEEMORE_PASSWORD` environment variable. There is no password flag. The build fails if the variable
is missing:

```bash
SEEMORE_PASSWORD='a long passphrase' npx seemore build
```

On Windows PowerShell:

```powershell
$env:SEEMORE_PASSWORD='a long passphrase'; npx seemore build
```

Password protection applies only to `seemore build`. The dev server and `seemore export` are not
protected. See [publishing](./publishing.mdx#password-protection) for setup and limits.
