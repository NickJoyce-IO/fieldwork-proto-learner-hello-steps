# hello-steps

Version 0.1.0. Work through the Steps below in order: each one is a small set of failing tests you make pass.

## Getting started

You need Node 24 and npm (see `.nvmrc`). If your local setup gives you trouble, open this repository in its devcontainer instead.

```sh
npm install
npm test
```

`npm test` runs the Steps in order and stops at the first one that fails: your Current Step. Steps after it are locked until it passes, but you can read their instructions and tests whenever you like.

## Steps

1. [Step 1: Greet someone](steps/01-greet/README.md)
2. [Step 2: Say goodbye](steps/02-farewell/README.md)

## Where things live

- `src/`: your code. This is the only place you edit.
- `steps/<step>/`: each Step's instructions, Hints and tests.
- `fieldwork.json`: this Project's version and its list of Steps.
- `.fieldwork/`: the commands behind `npm test`.

## Workflow

For each Step (or a few at once), work on a branch, open a pull request against `main` in this repository, and merge it once its check passes. The check's summary shows which Steps the pull request passes.
