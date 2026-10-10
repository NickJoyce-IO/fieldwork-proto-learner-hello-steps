# hello-steps

Version 0.2.0. Work through the Steps below in order: each one is a small set of failing tests you make pass.

## Getting started

You need Node 24 and npm (see `.nvmrc`). If your local setup gives you trouble, open this repository in its devcontainer instead.

```sh
npm install
npm test
```

`npm test` runs the Steps in order and stops at the first one that fails: your Current Step. Steps after it are locked until it passes, but you can read their instructions and tests whenever you like.

## Protect main

Before your first pull request, protect `main` as you did in the first Project of this Track: changes reach it only through a pull request, once the Fieldwork check has run. One command does it. It needs the GitHub CLI (https://cli.github.com), logged in with `gh auth login`:

```sh
npm run setup
```

It adds a ruleset to this repository that requires a pull request and the "Fieldwork Steps" check before anything reaches `main`. Running it again is safe. If it cannot reach GitHub or change the repository's settings, it tells you what to fix.

## Steps

1. [Step 1: Greet someone](steps/01-greet/README.md)
2. [Step 2: Say goodbye](steps/02-farewell/README.md)

## Where things live

- `src/`: your code. This is the only place you edit.
- `steps/<step>/`: each Step's instructions, Hints and tests.
- `fieldwork.json`: this Project's version and its list of Steps.
- `.fieldwork/`: the commands behind `npm test`.

## Workflow

For each Step (or a few at once), work on a branch, open a pull request against `main` in this repository, and merge it once its check passes. The check's summary shows which Steps the pull request passes. After each merge, the pinned Progress issue is updated with your Completed Steps.

## Updates

This Project gets fixes and new Steps over time. To check for a newer version (this needs the GitHub CLI, logged in with `gh auth login`):

```sh
npm run update
```

If there is one, it opens a pull request in this repository that brings it in, listing the Steps it adds, changes and removes. Review it and merge it like any other. It never changes your code in `src/`, and Steps you have completed still pass afterwards.

A major update may change Steps you have completed, so it is only made when you ask for it: `npm run update` tells you what it contains, and `npm run update -- --major` takes it.
