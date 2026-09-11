# Contributing to seemore

Thanks for taking the time. Bug reports, feature requests and pull requests are all welcome.

## Reporting a bug

[Open an issue](https://github.com/arifszn/seemore/issues) with:

- what you ran (`seemore`, `seemore build`, the VS Code extension) and the version
- what you expected and what happened instead
- a small folder of Markdown that reproduces it, if you can

Paths are where most bugs live, so mention your operating system and Node version.

## Requesting a feature

[Open an issue](https://github.com/arifszn/seemore/issues/new?labels=enhancement) describing the problem you ran into. Knowing the situation that led you there is more useful than a proposed API.

## Working on the code

Requires [Node.js](https://nodejs.org) 20 or newer and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/arifszn/seemore.git
cd seemore
pnpm install
pnpm build
```

The repo is a pnpm workspace with three packages:

| Package | What it is |
| --- | --- |
| `packages/seemore` | The CLI and the site it renders |
| `packages/vscode` | The VS Code extension, which runs that CLI |
| `packages/site` | The documentation site, itself built with seemore |

To see your changes, build the CLI and serve the docs site with it:

```bash
pnpm --filter seemore build
pnpm --filter site dev
```

Each package has a `SPEC.md` describing how it is meant to behave. Read the relevant one before changing behaviour, and update it when the behaviour changes.

## Before opening a pull request

Run the same checks CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

CI runs them on Node 20, 22 and 24, on Linux and Windows. Windows is not optional here: seemore is fundamentally a path resolver, and that is where those bugs live.

A few things that make a pull request easy to merge:

- one change per pull request
- a test alongside any behaviour change, in that package's `tests/`
- documentation updated in `packages/site` if you changed something a user sees

## Releases

Maintainers publish by pushing a tag: `seemore-v*` publishes the npm package, `vscode-v*` publishes the extension to the VS Code Marketplace and Open VSX.

## Licence

By contributing, you agree that your contributions are licensed under the [MIT Licence](LICENSE).
