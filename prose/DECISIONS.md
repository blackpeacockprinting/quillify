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
| Assertions on the text of `Quill.yaml` and `example.md`, in `assemble` (both) | Each name gains quotes, in the commit that writes names as JSON strings where the fork writes them bare (#24). |

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

## 10 Oct 2026: v0.1.0 fixes four more defects of the carried code

Adds to "Two releases", which names the strip fixes alone.

**Context.** Four things in the carried code cannot ship in a package. A dynamic form is laid out inside the host page's document, under the host's styles (#22). A host that set its own pdf.js worker gets one without the null guard (#23). A quill or a field named `true`, `false` or `null` breaks the YAML it is written into (#24). And the refusal for a character the standard fonts cannot encode never fires, so such a form ends in an error (#65).

**Decision.** v0.1.0 fixes all four, each in its own pull request with a failing test first. Everything else in the release is the fork's behavior.

**Unlock.** None.

## 10 Oct 2026: A background keeps no annotation but a link

Adds to "Two releases", which puts #20 and #21 in v0.1.0.

**Context.** The fork's strip removed widgets and kept every other annotation as it was (#20), and it knew a widget only by a `/Subtype` written as a name (#21). Published forms carry more than widgets and links. Counted on qpdf-decrypted copies of 1,395 distinct forms (the 59 and the AF e-Publishing pull, each file once): 116 entries in a page's `/Annots` that are neither, on 11 forms. Fifteen are marks a viewer paints over the page: 6 strikeouts, 4 text boxes, 4 lines and a stamp, on 7 forms. 38 are notes flagged hidden, and 49 are popups. 14 are no annotation at all: a script action, a name tree, the form dictionary itself, listed where an annotation belongs. 53 name an author, the 15 marks and the 38 notes.

**Decision.** Of a page's annotations a background keeps its links. Every other object that reads as an annotation is deleted, whether a page lists it or not: one that says `/Type /Annot`, one with a `/Rect`, or a widget. So those 7 backgrounds do not look like the published file opened in a viewer. They show the form without the review marks left on it.

**Unlock.** A published form whose printed content is itself an annotation.

## 10 Oct 2026: The carried strip test stops keeping the sample's link

Adds to "Which carried tests change, and how".

**Context.** `strip.test.ts` asserts that the sample's one link survives the strip. That link holds its address as a PDF name where a string belongs (#56). From #19 on, the strip keeps a link only when its address is an http or https string or its destination is in the file.

**Decision.** That case asserts that no annotation is left, and its title says so. `strip-actions.test.ts` holds a well-formed link. No other assertion in the carried test changes.

**Unlock.** The sample is regenerated with a string for its address (#56).

## 10 Oct 2026: A page and a link keep a named set of keys

Adds to "Two releases" and to "v0.1.0 fixes four more defects of the carried code". v0.1.0 also takes #26 and four levels of #25: the page tree, the page, the link and its action. The trailer, and what a kept value holds, stay with v0.2.0.

**Context.** The strip named what it took off a page (`/Annots`, `/CropBox`) and kept the rest, so a page action, a thumbnail or an application's private data rode into every background, and a link kept any action with anything chained after it (#18, #19, #26). Naming each key that can act means reading the specification for the next one nobody thought of (#25). What published forms use is small, and it was counted on qpdf-decrypted copies of 1,395 distinct forms (the 59 and the AF e-Publishing pull, each file once): 1,792 pages using 19 keys, 1,406 page tree nodes using 6, and 121 links using 15.

**Decision.** `stripAcroForm` keeps of a page tree node, of a page, of a link and of a link's action the keys listed at the top of `strip.ts`, and deletes every other. A link stays when it leads one way (by an `/A` or by a `/Dest`, never both, with nothing chained by `/Next`) and that way is a `/URI` that begins `http://` or `https://` in either case, a `/GoTo` to an explicit destination, or an explicit `/Dest`. The action a link keeps is a copy. A page object the page tree does not hold is deleted, as an object that reads as an annotation is.

The address is read from the string as pdf-lib decodes it. Two spellings the specification allows decode differently there, a hex string with white space in it and a literal split over lines, and `normalizePdf` writes neither.

What it costs on those forms: of the 121 links 86 stay (75 to a web address, 11 inside the file) and 35 go (20 with no scheme, such as `www.va.gov`; 14 `mailto:`; one `file:`). The page keys that go are `/ArtBox`, `/BleedBox` and `/TrimBox` (18 pages each), `/Thumb` (13), `/PieceInfo` (3), `/LastModified` (3), `/B` (2) and `/Marked` (1). The `/CropBox` is folded into the MediaBox as before. One page tree node loses `/ITXT`, and one a `/MediaBox` that its page has by then taken as its own. The link keys that go are `/NM` and `/P`. With annotations hidden, every page paints as it did: 1,792 pages in the 1,395 files (Poppler 26.08.0, 60 dpi, crop box).

What a kept value holds is not read. A `/Resources` dictionary, a `/Border` array or the elements of a destination array can still reference anything, and that is what is left of #25.

**Unlock.** A consumer who needs the links with no scheme or the `mailto:` ones (#68 has the counts and what each takes). A published form with a key outside a set that changes how its page paints or reads.

## 10 Oct 2026: What the raster assertions take with them

Adds to "Which carried tests change, and how", whose table deletes the raster assertions (#9).

**Context.** Three edits ride with those deletions and are not one. The field-cap case in `refusals` builds twelve pages of noise, so that a page rastered before the cap was read would trip the raster budget first. A header comment in `published-forms` explains a count by the raster and names a script this repository does not carry. And every test that calls `inventoryPdf` destructures a result that is about to be the inventory itself.

**Decision.** The field-cap case builds one blank page, its title stops at "names the whole count", and its assertion on the noisy file's size goes with the noise. Its assertion on the refusal does not change. The `published-forms` comment says what its counts are. Each call to `inventoryPdf` in a test takes the inventory where it destructured `{ inventory }`, in the commit that changes what the function returns, and no assertion changes for it.

**Unlock.** None.

## 10 Oct 2026: Page rasters are removed

**Context.** The fork's `inventoryPdf` also renders every page to a PNG, and the app posts those images to the model that names the fields. That client stays with the app and this library calls no model, so nothing here reads a raster. The rasters cost a canvas per page, a 9 MiB budget with a refusal of its own, and pdf.js's image codecs, which a consumer would have to serve from a fixed path: without them a JBIG2 scan such as SF 144 rasters white.

**Decision.** `inventoryPdf` returns the inventory alone. The rasterizer, its budget and that refusal are deleted, with the codec path and the plugin that served the codecs to the tests. A scan the fork refuses for the size of its rasters inventories here. Every caller takes the inventory where it destructured one, the carried tests among them, and no assertion changes for it.

**Unlock.** A consumer adopts a namer that reads the page (#35).

## 10 Oct 2026: A refusal is a code with its data

**Context.** In the fork each stage refuses a PDF by throwing a sentence written for the app's user ("this app cannot open it there", "Pick a smaller one."). A package cannot ship another product's copy, and a caller cannot branch on prose (#8).

**Decision.** A stage throws `Refused`, which carries a `Refusal`: a code, with the numbers and names the sentence held (`src/refusal.ts`). Its `page` counts from 0, as a `Place`'s does, where the sentences counted from 1. The codes are the ones proposed in #3 and one more, `rotated`. The plan was to delete the rotation guard as unreachable, because `normalizePdf` runs qpdf with `--flatten-rotation` before any stage reads a page. Measured, qpdf folds a page's own quarter turn into the page and leaves three rotations where they were: one inherited from the page tree, one of 450 degrees and one of -90. pdf.js reads each as a rotation, so the guard stays and refuses with the page number. The glyph refusal keeps its site and takes a code, though it cannot fire as written (#65).

In the carried tests each assertion on a sentence becomes one on a code, as the table says, and a case that asserted the error's class asserts `Refused`. Beyond the table: the header comments of `refusals` and `pdfjs` stop describing an app and a person reading words, a comment in `refusals` loses "tells the person", and the `pdfjs` cases are titled by their code where they said "in words". No carried case is added or dropped. The codes no carried case reaches are asserted in a test file of this repository's own, `refusal.browser.test.ts`.

**Unlock.** #3 for the names. For a rotation folded here and not refused, a published form that carries one of the three.

## 10 Oct 2026: The inventory leaves out what its types do not cover

Adds to "v0.1.0 fixes four more defects of the carried code".

**Context.** In the fork a server route parsed the inventory against a schema before anything used it. A file with a widget of an unknown field type, or with a choice option that was no string, was answered with an error for the whole request. This package has no such route, so those values reached a caller under types that forbid them (#79).

**Decision.** The inventory leaves out a widget whose `/FT` names none of the four field types, and an option of a choice that is not a string. The rest of the file is read as before. None of the 1,351 Air Force forms pulled for #54 has such a widget or option, so no measured form changes.

**Unlock.** A consumer that has to be told a file held one, which is a refusal code or a count on the form.

## 10 Oct 2026: The inventory refuses a file with no field

**Context.** In the fork the inventory refused a file with no field only when the file declared an XFA form, and the app's wizard refused the others in a sentence of its own. `sanitize` (#12) is where that second refusal would be made here, the one refusal that does not come from a stage.

**Decision.** `inventoryPdf` refuses every file with no field as `no_fields`, and `xfa` says whether the file declares an XFA form. `sanitize` will return what a stage refuses and refuse nothing itself. No carried test changes: none reads the inventory of a file with no field.

**Unlock.** A caller that wants the empty inventory of such a file.

## 10 Oct 2026: Where the built API departs from the proposal

Adds to "The API is built as proposed".

**Context.** `quillify` is built (#13), and with it the API differs from #3's signatures in four places. Each is small, and each is the maintainer's to reverse.

**Decision.**

- `tree` is a `Map`, where #3 says `ReadonlyMap`. `Quill.fromTree` takes a `Map`, and a read-only one does not pass to it without a copy or a cast.
- An `engine` problem's `diagnostic` is optional, because the engine types a diagnostic's code as optional.
- A read-only field is left out of the quill whatever its entry says, as the fork's `qualify` step left it out, and `check` counts it as dropped. The other choices are to honor `keep: true` on such a field, or to report it as a problem.
- The engine takes a description of one line, and `check` does not copy that rule. A description that holds a line feed passes `check` and comes back from `quillify` as an `engine` problem with the engine's code. A copy of the rule here would be a second place to change when the engine's changes.

**Unlock.** The maintainer's answer on #3. For the description rule, a consumer whose interface lets a person type a line break into a description, and so wants the problem to name the field.

## 10 Oct 2026: A carried test takes an opened document and its closer

Adds to "Which carried tests change, and how".

**Context.** `openPdf` returns a loading task whose promise it has already awaited, and each caller awaits it again and destroys the task. From #23 on every open has a worker of its own to end, which destroying the task does not do. One carried test opens a PDF that way: `xfa.browser.test.ts`, in the case "stamps no chrome over the page it just drew". `pdfjs.browser.test.ts` calls `openPdf` only where it rejects, and does not change.

**Decision.** That case takes `{ pdf, close }` from `openPdf` where it took a task, and calls `close()` where it destroyed the task. Only the call shape changes, and no assertion does. Two tests that are not carried change with it: `background.browser.test.ts` the same way, and `page-identity.browser.test.ts`, which calls pdf.js itself and so makes its own worker from the package's worker file.

**Unlock.** None.
