# Contributing

Every `#N` here is an issue or a pull request of this repository. A contribution comes under the package's license, Apache 2.0 (inbound equals outbound, section 5). There is no agreement to sign.

## Set up

Node 24 (`.nvmrc`), in a clone or in your fork:

```
npm ci
npx playwright install --only-shell chromium
npm run gate
```

The second line downloads the headless Chromium shell the browser tests drive.

## The gate

`npm run gate` is the one verb: `npm run build`, Prettier, `tsc`, then Vitest's two projects. A `*.browser.test.ts` file runs in headless Chromium and every other test file in node. `npm run format` fixes what Prettier flags. CI runs the gate once on every pull request and allows it ten minutes.

`npm run corpus` is no part of the gate: it needs published forms the repository does not hold ([`corpus/README.md`](corpus/README.md)).

## A change

- Branch from `main`: `port/`, `feat/`, `fix/`, `docs/`, `chore/`, `test/` or `release/vX.Y.Z`. `main` moves only by a merge commit from a pull request.
- One concern per pull request, small enough to read in one sitting. A bug fix and a feature are two pull requests.
- A branch merges only when it contains `main`. CI checks the pull request's tree, and nothing runs after the merge.
- A fix or a feature is two commits: the test that fails, then the change that passes it without touching the test:

  ```
  Tests hold a turned caption's borders and text to its layout
  A caption a dynamic form turns by quarters is redrawn turned
  ```

- A commit subject is a plain sentence saying what now holds, 72 characters at most, with no prefix. The body gives the reason and what was deleted, wrapped at 72. A change to code ends with `Check:`, the command and what it returned. `Refs #N` names the issue the commit serves.
- The pull request's title is the merge commit's subject and its body the message, so write both for `git log`. The body's headings: **Before**, **After**, **How**, **Not in this pull request**, **Trade-off to confirm**, **Commands run**, then `Closes #N`.

## Tests

A hostile input is built in its test, from bytes, so the repository holds no dangerous file.

A published fixture is a blank form, byte for byte as published, and test values are notional. Nothing a person entered into a form goes into a fixture, a test, an issue or a pull request, and neither does a name or identifier that we add. What a publisher left in its own file's metadata stays.

## Carried code, decisions

The first modules and tests came from a private repository, in commits with a `Source:` trailer (`git log --grep='^Source: '`). A review needs only this repository. A carried module changes in a pull request that says why, and a carried test only by an entry in [`prose/DECISIONS.md`](prose/DECISIONS.md), written before the edit. A decision goes there too: its context, the decision and what would unlock another.

## Prose

Comments default to none, and one earns its place only where the code cannot carry the fact itself. What survives states what is: present tense, unsold, no history. A Markdown paragraph is one line.

## A release

A release is a pull request from `release/vX.Y.Z` that sets the version in `package.json` and the lockfile and heads the changelog's `## Unreleased` entries with it. Merging it runs `release.yml`: the gate, `npm pack`, the tag, `npm publish` of that tarball with provenance, and a GitHub release. A published version is permanent, so everything that can fail runs before the tag.

Before 1.0 a minor release may change what a consumer's code must do, and the changelog says how to move. A patch release does not, and adds no refusal code.
