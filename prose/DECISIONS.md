# Decisions

What was decided, why, and what would unlock a different answer. Append-only: a decision that changes gets a new entry naming the one it replaces.

## 9 Oct 2026: Scope

**Context.** The engine's documentation puts this layer out of its scope: producing `form.pdf` and `form.json` from a raw PDF "is the job of a separate _quillification_ layer".

**Decision.** This repository is that layer, as a package that imports the engine. PDF bytes go in and a quill's files come out. It has no interface, calls no model and stores nothing.

**Unlock.** None. A second kind of output (a Typst replica, a flattened print) is a different project.

## 9 Oct 2026: TypeScript, in a browser

**Context.** A dynamic XFA form has to be laid out before its fields have positions. pdf.js does that under a permissive license, and it solves the layout in a real browser's DOM. For every other stage I found a Rust path by reading crates and their issue trackers (#37 has the table). The known consumer is a browser app.

**Decision.** v0.1 is TypeScript and runs in a browser. Each stage but XFA is a function from bytes to bytes behind its own tests, so a Rust core can replace stages one at a time without changing the API.

**Unlock.** For Rust, a spike that passes the fixture checks on the static fixtures (#37). For Node, a named server-side consumer (#34).

## 9 Oct 2026: The code is carried from the fork

**Context.** The importer exists in `tonguetoquill/web-app-afa-demo` at `842ef4207cb5`, under `src/lib/services/pdf-import/`: 14 modules (1,543 lines), a stylesheet and 16 test files. Measured there on 59 published forms, it converts 49 and refuses 10 by name. Its modules import nothing from Svelte or SvelteKit. Dumped from a scratch clone at that commit, its inventories match the counts its own tests assert: 46, 35, 21, 44, 30 and 84 fields on the six static fixtures and 78, 116 and 159 on the three dynamic ones.

**Decision.** v0.1.0 is that behavior behind a package's API. Eleven modules and the stylesheet are carried by the rule in [`CONTRIBUTING.md`](../CONTRIBUTING.md), and the port is compared against those dumps. Three modules stay with the app: its server client, the reader for a document embedded in an exported PDF, and the zip writer with its test.

Every `Source:` line and the review command need the fork readable at that commit, so the fork is archived and kept.

**Unlock.** None for the method. Behavior that differs from the fork is a bug in the port until an entry here says otherwise.

## 9 Oct 2026: Which carried tests change, and how

**Context.** A test edited in the change it guards cannot show that the code kept its behavior. None of the 15 tests that come with the carried modules runs here untouched: every one needs its paths changed, five reach the engine through the app's own service, and two of those read a file this repository does not carry.

**Decision.** A carried test changes only as listed here, or by a later entry.

| Test | Edit |
| --- | --- |
| `strip`, `assemble`, `coords`, `display-list` (both), `normalize`, `refusals`, `xfa`, and `corpus` renamed `published-forms` | Paths only. A file that runs in Chromium is named `*.browser.test.ts`. |
| `pdfjs` | Its one XFA case moves to the pull request that carries the XFA modules. |
| `assemble`, `background`, `radio-binding`, `rotation`, `real-form` (the browser ones) | Rewritten over a small engine harness (`init`, `Quill.fromTree`, `new Engine()`). The case that needs the app's quiver stays with the app. |
| `background` and `real-form`, which read the fork's copy of DD 2977 | The file is not carried: it is a converted copy whose producer is Aspose, and the published DD 2977 is dynamic XFA. A script builds the shapes those tests need. |
| Refusal assertions | Move from sentences to codes, in a commit before the change that introduces the codes (#8). |
| Raster assertions | Deleted with the rasterizer, a function in `inventory.ts`, in the pull request that removes it (#9). |

**Unlock.** A new entry, written before the edit.

## 9 Oct 2026: Dependencies

**Context.** The fork's importer uses three PDF libraries because no one of them does the whole job: qpdf decrypts and flattens rotation, pdf.js lays out XFA and reads annotations, pdf-lib writes.

**Decision.** `pdfjs-dist` 6.3.289, `pdf-lib` 1.17.1 and `@neslinesli93/qpdf-wasm` 0.3.0, pinned exactly, as the fork has them. `@quillmark/wasm` is a peer dependency, so the consumer's copy is the only copy (#6). Nothing else at run time: no schema library, no zip, no YAML. The build is `tsc`.

**Unlock.** One per dependency: a maintained successor to pdf-lib (#45), a qpdf binary built from source (#46), pdf.js 6.4 evaluated (#48).

## 9 Oct 2026: The API waits for confirmation

**Context.** An exported name is permanent once a consumer imports it, and the design of the API is the maintainer's to confirm.

**Decision.** The port lands first and exports nothing. Names are exported only after #3 closes.

**Unlock.** #3.

## 9 Oct 2026: Two releases

**Decision.** v0.1.0 is parity with the fork in a form a package can ship, plus the strip fixes in #18 to #21. v0.2.0 rebuilds every dictionary in the background PDF from an allowlist (#25).

**Unlock.** None.

## 9 Oct 2026: One CI job

**Context.** The org's Actions minutes are one pool, shared with web-app.

**Decision.** One job runs the whole gate on each push to a pull request and cancels the run it supersedes. Nothing runs on a push to `main`. Hosted CI for this repository stops at 300 billed minutes across v0.1.0. Past that, a pull request carries the local gate's output and says so.

**Unlock.** A larger pool, or a self-hosted runner.

## 10 Oct 2026: The pdf.js guard is applied by a verb

**Context.** Stock `pdfjs-dist` 6.3.289 fails to load DAF 1288: two lines of its XFA resolver read a property off a slot that is null. The fork edits the installed worker with patch-package on postinstall. This repository's `.npmrc` turns install scripts off, and a library cannot count on a postinstall of its own to patch the copy of pdf.js its consumer installs.

**Decision.** `npm run patch` makes the fork's two edits in the installed worker, and a test fails by name when they are missing. That covers this repository's own suite and nothing more. What a consumer gets is a guarded worker the package ships itself (#10).

**Unlock.** pdf.js carries the guard (#47), or the move to pdf.js 6.4 shows it is no longer needed (#48). Either one removes the script, the test and the CI step.

## 10 Oct 2026: The API is built as proposed

Replaces "The API waits for confirmation".

**Context.** #3 proposes four functions and their types, and it is the maintainer's to confirm. Every pull request after the port builds on those names, so waiting on #3 holds all of them.

**Decision.** I am building the proposal, with two additions the engine's behavior asked for: a problem for an empty quill description, which the engine refuses, and the engine's own code on an `engine` problem. #3 stays open. Nothing depends on the names before the first tag, so until then a rename is one pull request.

**Unlock.** The maintainer's answer on #3.
