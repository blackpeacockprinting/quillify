# Contributing

A contribution comes under Apache 2.0, the package's license. No agreement to sign.

## Set up

Node 24 (`.nvmrc`), in a clone or in your fork:

```
npm ci
npx playwright install --only-shell chromium
npm run gate
```

The second line downloads the headless Chromium shell. The gate is the build, Prettier, `tsc` and the tests, in node and in headless Chromium. CI runs it on every pull request and allows it ten minutes. A daily run holds it to the newest release of `@quillmark/wasm` and opens an issue when the gate is red on it.

## Changes

- Branch from `main`: `port/`, `feat/`, `fix/`, `docs/`, `chore/`, `test/` or `release/vX.Y.Z`.
- `main` moves only by merge commit.
- A branch merges only when it contains `main`.
- One concern per pull request.
- A fix or feature is two commits: a failing test, then the change that passes it untouched:

  ```
  Tests hold a turned caption's borders and text to its layout
  A caption a dynamic form turns by quarters is redrawn turned
  ```

- Commit subject: a plain sentence of what now holds, 72 characters at most, no prefix.
- Commit body: the reason and what was deleted, wrapped at 72. Code changes end with `Check:`, the command and its result. `Refs #N` names the issue.
- Pull request: the title becomes the merge commit's subject. Headings: **Before**, **After**, **How**, **Not in this pull request**, **Trade-off to confirm**, **Commands run**, then `Closes #N`.

## Tests and carried code

- A test builds its hostile input from bytes.
- A fixture is a blank published form, byte for byte but for a name or ID of its author or contact, which is blanked. Test values are notional.
- Nothing a person entered into a form goes anywhere: no fixture, test, issue or pull request.
- The first modules came from a private repository, in commits with a `Source:` trailer. A review needs only this repository, and carried code changes in a pull request that says why.
- A design decision, and any change to a carried test, is explained in the pull request that makes it, and the test commit's message says why the test changes.

## Prose

- Comments default to none.
- A Markdown paragraph is one line.

## Releases

- A release starts with the **Prepare release** workflow, dispatched with a bump: `patch`, `minor` or `major`. It opens the release's pull request, which merges before any other.
- A pull request from `release/vX.Y.Z` sets the version and heads the changelog's `## Unreleased` entries. The release before leaves the changelog: its notes are on the releases page.
- Merging it runs `release.yml`: the gate, the tag, `npm publish` with provenance.
- Before 1.0 a minor release may break a consumer's code, and the changelog says how to move. A patch release does not, and adds no refusal code.
