# Contributing

## A change

- Branch from `main`: `port/`, `feat/`, `fix/`, `docs/`, `chore/`, `test/` or `release/vX.Y.Z`. `main` moves only by a merge commit from a pull request. The branch is not protected, so nothing but this rule stops a direct push.
- One concern per pull request, small enough to read in one sitting. A bug fix and a feature are two pull requests.
- A branch merges only when it contains `main`. CI checks the pull request's tree, and nothing runs after the merge.
- A commit subject is a plain sentence saying what now holds, 72 characters at most, with no prefix. The body gives the reason and what was deleted, wrapped at 72. A change to code ends with `Check:`, the command and what it returned. `Refs #N` names the issue the commit serves.
- A fix or a feature is two commits: the test that fails, then the change that passes it without touching the test.
- The repository merges with the pull request's title as the subject and its body as the message, so both are written to be read in `git log`.

## The gate

`npm run gate` is the one verb: `npm run build`, Prettier, `tsc`, then Vitest's two projects. A test file's name picks its runner: `*.browser.test.ts` runs in headless Chromium and every other test file in node. `npm run format` rewrites what `npm run lint` flags.

Tools are pinned exactly and installed with `npm ci`. `npm run assets` writes `assets/`: from `node_modules` the pdf.js worker, with two lines guarded so that DAF 1288 loads, and `qpdf.wasm`, and from `src/xfa-layer.css` the stage's stylesheet as a module. `npm run build` runs it and then compiles `src/` to `dist/`, which the package's entry point names and a tarball carries. `npx playwright install --only-shell chromium` fetches the browser the Chromium project drives.

## Carried code

Code from the fork arrives one module per commit, with a diff against its source that touches imports and nothing else, and a trailer naming the source:

```
Source: tonguetoquill/web-app-afa-demo@842ef4207cb5 src/lib/services/pdf-import/strip.ts
```

It is reviewed with `git show 842ef4207cb5:<path> | diff - <file>` in a clone of the fork, which is a faster and surer read than the code itself. A port commit that also fixes what it carries cannot be reviewed that way, so a carried module changes only later, in a pull request that says why.

## Tests

A carried test changes only by an entry in [`prose/DECISIONS.md`](prose/DECISIONS.md), written before the edit. A hostile input is built in its test, from bytes, so the repository holds no dangerous file.

A published fixture is a blank form, byte for byte as published, and test values are notional. Nothing a person entered into a form goes into a fixture, a test, an issue or a pull request, and neither does a name or identifier that we add. What a publisher left in its own file's metadata stays: removing it would end the identity with the published file.

## Comments and prose

Comments default to none, and one earns its place only where the code cannot carry the fact itself. What survives states what is: present tense, unsold, no history. A decision and its reason go in `prose/DECISIONS.md`.

A Markdown paragraph is one line.
