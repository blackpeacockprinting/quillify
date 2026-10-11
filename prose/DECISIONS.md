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

## 10 Oct 2026: The pdf.js guard lives in the worker the package ships

Replaces "The pdf.js guard is applied by a verb".

**Context.** `npm run patch` edited the installed worker. That covered this repository's suite and no consumer: a package cannot patch the pdf.js its consumer installs, and the worker was a module of whatever bundle the app built. The carried code reached its two other assets the same way, through Vite's `?url` and `?inline` (#10).

**Decision.** `npm run assets` writes `assets/` from `node_modules`, and the library loads its worker, `qpdf.wasm` and the stage's stylesheet from there. `assets/pdf.worker.js` is the 6.3.289 worker with the two edits, without its last line, which names a source map the package does not ship, and under a first line that says it was changed, as its license asks. The script throws unless it finds exactly two unguarded sites, and unless `qpdf.wasm` has the recorded hash. Nothing edits `node_modules`. The gate runs the script first, and a test fails by name when `assets/` is missing or stale. `scripts/patch-pdfjs.js`, its test and its CI step are deleted.

The source holds the worker's URL in a constant. Vite 8.3 copies the file then, and bundles and minifies it again when the URL is written inside `new Worker(...)` (#10 has both measured, in that one bundler). Each open makes a worker of its own and ends it, and the library neither reads nor writes pdf.js's global worker settings (#23).

**Unlock.** pdf.js carries the guard (#47), or the move to pdf.js 6.4 shows it is no longer needed (#48). Either one leaves the dropped last line as the worker's only change.

## 10 Oct 2026: A dynamic form is laid out in a document of its own

Adds to "v0.1.0 fixes four more defects of the carried code", which names #22.

**Context.** The carried stage is a `<div>` in the host page's document with the XFA stylesheet in a `<style>` inside it. Three things follow, each now watched in a test. The host takes the XFA rules while a form converts: its `:root` has `--xfa-unfocused-field-background` until the stage closes. The form is measured under the host's rules: with plain rules on `*`, `div` and `input` (box-sizing, font size, padding, border), all 78 fields of DD 2875 move, 7 to 21 pt right and 7 to 45 pt down, 65 of them up to 10 pt narrower and 77 up to 4 pt shorter. And pdf.js adds the faces a form embeds to its owner document's font set: DD 2875 with the Calibri subset of SF 182 added to its form's fonts puts a Calibri face in the host's `document.fonts` until the file is closed. No committed dynamic fixture embeds a face, so that file is built in its test. The stage also sits at `left: -99999px`, which a right-to-left page can scroll to: its scroll width goes from 414 to 100,413 px while a dynamic form converts.

**Decision.** The stage is an `<iframe>` with a `srcdoc` and `sandbox="allow-same-origin"`, so it has a document of its own and runs no script. It is hidden, out of the flow and of no size (`position: fixed`, no width, height or border, `visibility: hidden`), so the host page shows, lays out and scrolls as it did, whichever way it reads. `display: none` would not do: it leaves the form no layout to measure. A `srcdoc` document is in standards mode, as the viewer the stylesheet was written for is. The document carries the policy `default-src 'none'; img-src blob: data:`, which lets it load an image the two ways pdf.js and the stylesheet hand it one, and nothing from the network. The policy names no font source. A form's face is not the frame's document's to load: pdf.js makes each `FontFace` in the host page's realm, from the file's bytes or a `local()` name, and adds it to the frame's font set.

The stylesheet is a constructed sheet made with the frame's own `CSSStyleSheet` and adopted on the frame's document. Before a page is laid out, a probe with the class `xfaLayer` has to compute `position: absolute`, which the sheet sets and a bare document does not, or the conversion ends with an error: without its rules a stage measures every field at its content size and reports nothing.

The host page still reaches the frame element. A rule that takes its boxes away, as `iframe { display: none !important }` does, or a script that takes the frame out of the document, empties every rect, so a page whose wrapper has no box after layout ends the conversion with an error that says the host page hid or removed the frame. It is not a refusal, because the file is not what failed. A wrapper with a box of no width is the file's doing, a page under a point wide, and that form converts as it did. A `zoom` on the frame or an ancestor scales the layout, and nothing reports it (#95). A frame removed before it has loaded leaves the conversion waiting (#99).

pdf.js is given the frame's document as `ownerDocument`, and it binds fonts as it opens a file, so the frame is made before the open for every file that reaches the conversion, dynamic or not. Making it takes about 1.5 ms in headless Chromium.

What the conversion returns is what it returned, with one difference. The nine goldens pass untouched. Of what `displayList` and `harvestWidgets` return for every page of the three dynamic fixtures, DD 2875 and DAF 1288 are identical, and DAF 988 differs in 4 of its 418 text runs by 0.01 pt in `x` or `width`, with every box, line and widget the same. The carried stage sits at `left: -99999px`. Moved to `left: 0`, it gives the frame's numbers for all three, so the four runs follow the old stage's offset.

**Unlock.** None.
## 10 Oct 2026: A test in the gate holds the source to no request API

Adds to "The pdf.js guard lives in the worker the package ships". Decided with that change (#93) and recorded here.

**Context.** #10 asks for one Semgrep rule, with its own fixture, that fails the gate on a network API in `src/`. The gate's tools are Prettier, `tsc` and Vitest, each pinned and installed by `npm ci`. Semgrep would be a fourth, installed some other way on every machine and in CI.

**Decision.** `test/no-network.test.ts` fails when a source module names `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `importScripts`. It is a check on six names in the modules under `src/`, and a request made some other way passes it. What holds the library to its own files is the browser test that lists every HTTP request `sanitize` makes for a dynamic form. #10's line on `?url` and `?inline` is read for the modules too: `test/assets.test.ts` holds it there, and a test file still imports a fixture by `?url`, which only the test server resolves.

**Unlock.** A rule set the organization runs across its repositories.

## 10 Oct 2026: The package is one entry point and a tarball of what it names

**Context.** The four functions were in `src/index.ts`, and `package.json` named no entry point, so nothing a consumer could install reached them (#10, #12). No license and no registry are decided (#4, #5).

**Decision.** `npm run build` compiles `src/` to `dist/` with `tsc`, beside `assets/`, so the relative URLs the source finds its worker and `qpdf.wasm` by hold in the build as they do in the source. The build has no ambient types, so a module that leaned on the bundler's would not compile. `exports` names `dist/index.js` and nothing else: a consumer cannot import a module under `dist/` or a file under `assets/` by path, and every module but the entry point stays free to change. `files` lists `dist`, `assets`, `NOTICE` and `licenses`, and npm adds `package.json` and `README.md`. `CHANGELOG.md` is not packed. The package stays `private` and `UNLICENSED`. `engines` asks for the Node the suite runs on, which a consumer's install then checks as well.

`NOTICE` names the three files that are other projects' work, and a test holds it to the installed versions. For `qpdf.wasm` it says what the tarball lacks. The wrapper ships no license text, so the texts of zlib, of libjpeg-turbo and of the C++ runtime linked into the binary, and the notices qpdf carries in its own `NOTICE.md`, are in neither place. That is settled before a tarball goes to anyone outside the organization, with the license (#4) or with a binary built here (#46).

**Unlock.** A registry (#5) changes what `private` and `files` say. A second entry point takes a consumer that cannot get what it needs from the four functions.

## 10 Oct 2026: A carried test's comments are reworded

Adds to "Which carried tests change, and how".

**Context.** The carried modules and tests came with their comments, and some of those are false or foreign here (#59). They count a corpus this repository does not hold, name the app's wizard, its naming pass and its server, or give a cause nothing here measured. A port commit could not fix them, since its diff against the source touches imports alone.

**Decision.** One pull request rewords the comments of the carried modules and of nine carried tests: `assemble` and `normalize` (the browser ones), `background`, `display-list` (the node one), `published-forms`, `radio-binding`, `real-form`, `rotation` and `xfa`. No assertion, name or value changes. With its comments removed, each file compiles to what it compiled to before.

**Unlock.** None.

## 10 Oct 2026: A dynamic form's check box is the square the browser paints

Adds to "Which carried tests change, and how" and to "v0.1.0 fixes four more defects of the carried code".

**Context.** pdf.js gives a check box or a radio button the width its template sets and the height of what is left of its row, so its box is seldom square. On each of the 124 buttons of the three dynamic fixtures it is taller than it is wide, by 3.4 to 10.6 pt. The browser paints the control as the largest square centered in that box. The carried code drew the square a check mark goes in at the top of the box and stamped the widget over all of it (#119). The printed square sat 1.7 to 5.3 pt above the control and its label's line, on DAF 988 over a word of the line above, and the engine's tick was drawn low in the widget, mostly under the square. A comment in the carried `display-list.ts` said the control is top-aligned in its box. A test now reads the browser's pixels and finds it centered.

**Decision.** The printed square and the widget are both the largest square centered in the control's box. The goldens of DD 2875, DAF 988 and DAF 1288 change in the rect of each of their 13, 54 and 57 buttons and in nothing else: each new rect is that square of the old one, to a hundredth of a point. In those 124 rects they are no longer the fork's dump, and the test that compares them no longer says they are.

**Unlock.** A browser that paints the control elsewhere in its box. The test that reads the pixels fails then.

## 11 Oct 2026: The API is the four functions as built

Replaces "The API is built as proposed", and settles "Where the built API departs from the proposal".

**Context.** #3 asked the maintainer to confirm four functions and to choose what `quillify` returns: the checked tree, the tree proven to open in the caller's engine, or a live `Quill` handle. It has had no answer, and the first release does not wait for one. The API was built as the first of the three. Nothing found since argues for another: both callers in the app the code came from take the tree, and the suite opens, renders and reads back every fixture's quill, which is the proof the second option would move into every call.

**Decision.** The API of v0.1.0 is what `src/index.ts` exports: `sanitize`, `suggest`, `check` and `quillify`, with `quillify` returning the tree once `Quill.fromTree` has taken it. The four departures from #3's signatures stand as recorded. A read-only field stays out of a quill whatever its entry says. That costs the 14 Air Force files whose every field is read-only, which build nothing. The one-line rule for a description stays the engine's.

**Unlock.** The maintainer's answer on #3. Before a consumer imports the package a rename is one pull request, and after it a breaking release. For the read-only rule, a consumer that has to fill a field its form marks read-only.

## 11 Oct 2026: No license while the package stays in the organization

**Context.** The repository is private, and the one consumer in view is the organization's own app (#4). The package redistributes the pdf.js worker, under Apache-2.0 and changed at two marked sites, and `qpdf.wasm`. `NOTICE` says what the tarball carries of each and which license texts it lacks.

**Decision.** No license is granted. `package.json` says `UNLICENSED`, and there is no `LICENSE` file.

**Unlock.** The first install outside the organization, or a public registry (#5). Before either, the licensor picks a license, and the texts `qpdf.wasm` ships without are supplied or the binary is built here (#46).

## 11 Oct 2026: No registry, and the name is quillify

**Context.** The app has to be able to install the package, and there is one app (#5). On 9 October `quillify`, `@tonguetoquill/quillify`, `@quillmark/quillify` and `@airmark/quillify` were all unregistered on npm.

**Decision.** The package is named `quillify` and marked `private`, so it cannot be published by accident. Each release attaches a tarball, an SBOM and `SHA256SUMS` to its GitHub release, and a consumer installs the tarball by path.

**Unlock.** A second consumer, or the app's maintainers wanting a version range where they have a file in their tree. A registry is then one line in `package.json` and one in the consumer, after the license.

## 11 Oct 2026: The engine is a peer, and its floor is the version the gate runs on

**Context.** A `Quill` handle from one copy of the engine is refused by another, so an app ends up with one copy or with none that works (#6). The engine moves quickly: eleven minor releases in three weeks, two of which began refusing a background that the one before took. The gate runs on 0.124.0. A reviewer ran the suite on 0.122.0 once, and it passed.

**Decision.** `@quillmark/wasm` is a peer dependency with one comparator, `>=0.124.0`, and an exact development pin at the same version. The floor is the version the gate runs on at a release. An older version that passed once is not held by anything from one change to the next, so it is not promised. The pin moves in a pull request of its own, so a test that goes red there points at the engine.

**Unlock.** A consumer that cannot move its engine up to the floor. The gate is then run on its version, and the floor moves down to it for as long as that run stays in CI.

## 11 Oct 2026: A release is not signed

**Context.** A release is a tarball on a GitHub release page, and nothing a consumer can check ties it to this repository (#7). `web-app#1438` settled the same question for the app's container images. GitHub's attestations need Enterprise Cloud for a private repository, and the organization's signing key is not available to this one.

**Decision.** A release carries `SHA256SUMS` and the output of `npm sbom`, and no signature. The sums show that a file is the one the release lists, to someone who trusts the release page.

**Unlock.** The app's images signed with a key this repository can use. A release is then signed the same way.

## 11 Oct 2026: SF 1152 stays as its publisher serves it

**Context.** SF 1152 names its author in its info dictionary and in its XMP packet (#55). The fixture is that file byte for byte, which the manifest's test holds. `CONTRIBUTING.md` bars a name that we add and leaves a publisher's own metadata alone. The strip drops both places, so the name reaches no background and no form filled from one.

**Decision.** The fixture stays as published. Scrubbed, it would be our file under our hash and no longer the published form. Dropped, the suite would lose the one fixture that paints every field twice over one field tree.

**Unlock.** A request from the publisher or from the person named, or a rule of the organization against any name in a repository. A generated file of the same shape then takes its place, as `test/dd2977-shape.ts` stands in for a form that was not carried.

## 11 Oct 2026: A source whose fields hold values is read like any other

**Context.** The library is for a blank form as published, and nothing stops someone handing it a copy that a person filled in (#33). Values held in the form layer leave with the widgets. A copy flattened in full has no field left and is refused for that. One flattened in part is another matter: its entries are page content beside live fields, and they become the background of a quill other people load. The library cannot tell printed text from typed text. What it can see is a field that holds a value, and that is the wrong sign. Seven of the 59 federal forms have such a field as published (page stamps, button captions, a `1`, a space), none of it a person's entry, and an entry that was flattened is in no field.

**Decision.** `sanitize` neither reports nor refuses a source whose fields hold values. `SECURITY.md` says what the library cannot see, and that the check on it is the consumer's: a person looks at the pages before a quill is shared.

**Unlock.** A consumer that wants to warn on a filled source, with a count that shows a field's value is a sign worth a property on `Form`.

## 11 Oct 2026: A quill carries nothing of what signing locks

**Context.** A published form says what signing a field locks, and on the nine fixtures it says so in the XFA and nowhere else: none of the 13 signature fields in a form layer has a `/Lock`, and 25 of the 28 in the XFA have a manifest ([`research/SIGNING.md`](research/SIGNING.md), #124). A form filled from a quill keeps each of the 13 as an unsigned widget with its name and its tooltip. `form.json` has no slot for a lock, and it is the engine's schema, which every other quill shares.

**Decision.** A quill carries no lock, as a quill from the app the code came from carries none, and the README says so. A signature placed on a filled form locks no field and writes no date beside it.

**Unlock.** A consumer that signs filled forms. The lock then takes a slot on a signature widget in the engine's form schema, and here the reading of each manifest into field names.

## 11 Oct 2026: Checkboxes of one name and several on-states are an exclusive group

Adds to "v0.1.0 fixes four more defects of the carried code".

**Context.** The value of a checkbox field in a file is the on-state of its ticked box, so boxes of one name that turn on as different values exclude each other. WH-380-E asks whether a job description `is` or `is not attached` with two such boxes. The carried inventory folds every widget of a name that is no radio button into one entry with several places. So the pair came back as one checkbox at two places, the quill bound one boolean to both, and `true` ticked both (#81). Twelve fields of WH-380-E are built that way, of its 19 checkbox fields, and no other of the 59 forms has one. Nine of the twelve hold two boxes and three hold three. Among the Air Force's files the one such form is DAF 2522, with eleven: 54 boxes that turn on as 37 values, and seven of the eleven names have two or more boxes of one value.

**Decision.** Option B of #81. The checkboxes of a name fold only when every one of them turns on as the same value. When they turn on as more than one value, each box is a field, and `sanitize` returns it as a `radio` with the shared name as its `group` and its on-state as `on`. That is what a radio group already is here: one boolean for each option, tied by a group (#41). No box of such a name folds, as no radio button does, so two of its boxes that turn on as one value are two fields. Folded, they would be a field of two places beside a field with the id `name#2`, and `name#2` is also what the assembly names a field's second place: `form.json` would name two widgets alike and the engine refuses that. The ids follow the rule for a name that repeats: the name, then `name#2`, in the order the boxes are met. Boxes of one name and one on-state stay one checkbox at several places, as on SF 1152.

For a consumer the kind and the ids of those fields change, so a naming stored for such a form has to be made again. WH-380-E goes from 60 fields to 75, at the same 77 places, and `corpus/manifest.json` and the total its test holds move with it. DAF 2522 is refused for its count as before, which goes from 457 to 500. No golden changes. This lands before the first tag because a field's id is what a stored naming refers to.

**Unlock.** The engine's form schema gains an on-value for each widget (#41). The group can then be one field that holds the chosen value.

## 11 Oct 2026: A background has no file identifier

Adds to "A page and a link keep a named set of keys", which leaves the trailer with v0.2.0.

**Context.** Two builds of DD 689, three seconds apart, differ in 29 bytes, all in the second element of the trailer's `/ID` (#27). qpdf writes that element fresh on every run, and the strip carried the trailer through. A quill is named by the hash of its files and a change to one is read as a diff, so the same bytes in have to give the same bytes out. A file identifier is how a reader pairs a file with data exported from it: the exported data records the `/ID` of the PDF it came from, and a reader compares the two. Nothing is exported from a background, which has no field. A dynamic form's background has no `/ID` already, since pdf-lib writes none for a document it creates.

Of the ten fixtures, seven carry one: the six static forms and the sample. With the whole `/ID` taken out, two builds 2.1 seconds apart are the same bytes for all ten, so no date, producer string or ordering differs.

**Decision.** `stripAcroForm` deletes the trailer's `/ID`, as it deletes `/Info`. A background has no file identifier, and `sanitize` run twice on one file returns one `form.pdf`. The first element, which a published form carries, goes with the second.

**Unlock.** A consumer that needs to pair a filled form with its background by identifier. The identifier is then derived from the background's own bytes, so it repeats with them.

## 11 Oct 2026: A background keeps its layers

**Context.** The strip keeps the catalog's `/OCProperties`, so the optional content groups of a published form, with their default state, ride into every quill (#32). Of 1,413 published files read with qpdf (the 59 federal forms and 1,354 Air Force files), 31 carry `/OCProperties`: 8 of the 59 and 23 of the Air Force files. None of the ten fixtures has a layer, and nine of them are among the 1,413. 13 of the 31 have content hidden in a state a reader starts in. 12 hide it for print only: a layer shown on screen and not printed, which Acrobat Designer writes as `ViewOnly Layer` beside an unused `PrintOnly Layer`. One hides it for the screen only. None hides content in every state, and the one layer that is off on screen guards a line drawn in white ink at zero opacity, so the layer is not what hides it. The issue's first comment counted nine forms and read no layer as off from an empty `/OFF`. It is eight, and 17 of the 31 set `/BaseState /OFF`, so a layer can start off with `/OFF` absent. The state is kept end to end: the background and the engine's rendered PDF carry the same groups and the same default, and pdf.js leaves an off layer blank in the source, the background and the rendered file. So does the engine's own painter. Dropping `/OCProperties` makes every layer visible, so content a publisher keeps off paper prints: four backgrounds gain it, among them the instruction page of two forms. Flattening to a default state needs a tokenizer for page and form content, which neither pdf-lib nor qpdf offers, and it picks screen or paper for the same four forms. Refusing a form with a layer off for the screen turns away 19 of the 31, each for a group nothing refers to or for the white-ink line.

**Decision.** A background keeps its layers as the file has them. Content in a layer that is off on screen or in print stays in the background, and `SECURITY.md` says so. `/OCProperties` is still kept whole: rebuilding it from a list of keys is part of #25. A test builds a form with a layer off, a layer on for the screen and off for paper, and the Designer pattern, and holds the groups and their default state in the background and in the rendered file, and what pdf.js and the engine's painter paint from them.

**Unlock.** A form whose layer hides content in every state, or a reader of quills that ignores optional content. The layers are then dropped or flattened, and the content a publisher keeps off paper is weighed against the content that should not be there.

## 11 Oct 2026: The shipped worker is guarded at a third site

Adds to "The pdf.js guard lives in the worker the package ships".

**Context.** AF 715, AF 716 and DAF 357 ended `sanitize` with pdf.js's `Cannot read properties of undefined (reading 'length')` (#85). That message is what any failure of pdf.js's XFA layout becomes: the layout's exception is caught and logged, and the count of pages is then read off a list that was never made. The failure itself is a stack overflow. Each of the three has one page set with no `occur`, holding one page area whose `occur` has a `max` of 1, and two pages of content. Asked for the second page, the page area is at its limit and hands back to the page set, which starts another pass with its page areas' counts as they were, and the two call each other until the stack ends.

**Decision.** `npm run assets` changes a third line of the worker: where a page set starts another pass it also clears its page areas' counts, with the method the class has for that. The worker the package ships now differs from the installed one at three sites, the two null guards that DAF 1288 needs and this one, and the script stops unless it finds each line the stated number of times. The three forms convert, to two pages each. The guard reads a page area's `max` as a count within one occurrence of its page set. That reading was not checked against the XFA specification or against Acrobat. Of the Air Force's 1,354 files, 60 have a page area with a finite `max`: the three change, and the other 57 come out as before.

**Unlock.** A pdf.js release that ends this recursion. Reporting it to pdf.js is #47's. The line and its sentence in the worker's notice are deleted in the change that takes that release.

## 11 Oct 2026: The shipped worker keeps a page's first unsplittable node across an overflow leader

Adds to "The pdf.js guard lives in the worker the package ships" and to "The shipped worker is guarded at a third site".

**Context.** pdf.js never finishes laying out DAF 1024, so `sanitize` never settles on it (#86). pdf.js gets past a node that can fit on no page by forcing the first unsplittable node of each page to fit. DAF 1024's last table has an overflow leader, its header row, and a data row whose first cell is lower than the field in it. On every new page the table lays out its leader first, the leader takes the place of the page's first unsplittable node, the data row after it fails, and the layout asks for another page that goes the same way. A table of two rows built in a test does the same. So does a leader that is a flowed subform around a draw: there the draw inside the leader takes the place.

**Decision.** `npm run assets` changes two lines of the worker's `handleOverflow`: it notes the page's first unsplittable node before it lays out a leader or a trailer and puts it back after. Nothing laid out there, the leader or a node inside it, takes that place, so the row after it is the one forced to fit. The worker now differs from the installed one at five lines: the two null guards (DAF 1288), the page set's (AF 715, AF 716, DAF 357) and these two (DAF 1024). pdf.js then finishes DAF 1024 in under two seconds, and the form still does not convert: `sanitize` ends with pdf-lib's error for a field named as the subform beside it (#84). The layout the guard gives it is three pages longer than its content needs, because each of that table's three data rows still fails its height check and is forced onto a page of its own. Of the Air Force's 1,354 files, 61 have an overflow leader, and the other 60 come out as before. `sanitize` still has no deadline, and nothing shows these are the only templates that keep the layout going, so #86 stays open for it.

**Unlock.** A pdf.js release whose layout ends on such a table. Reporting it to pdf.js is #47's. The two lines and their sentence in the worker's notice are deleted in the change that takes that release.

## 11 Oct 2026: A dynamic form's fields are stamped flat, each under its whole name

Adds to "The code is carried from the fork".

**Context.** A harvested widget's name is its SOM path joined with periods, and the carried `stamp` hands that name to pdf-lib, which reads each period as a level of its field tree. pdf-lib holds no name as both a field and the parent of a field, and takes no name with an empty part. So three shapes of form end `sanitize` with pdf-lib's error (#84): a field named as the subform beside it, a field with no name beside a named one (it is called what its subform is), and a field whose name ends in a period. Twelve of the 1,354 Air Force files do, nine with "A field already exists" and three with "Periods in PDF field names". A test builds each shape.

**Decision.** The fields the conversion stamps are flat: each is a child of the form's root, made from pdf-lib's own field classes with its whole name as its `/T`, periods included. pdf-lib's form is not asked to create them: its `create` calls are what read a period as a level, and they compare each new name with every sibling's, which for flat fields is every field so far (5.5 s for 2,000 fields in Node, where making them directly takes 45 ms). A radio group is made the same way under its group's name. pdf.js names a field by joining the `/T` of its ancestors with periods, and pdf-lib reads a tooltip's field by the same join, so the inventory reads the names it read before and the three dynamic fixtures' goldens pass untouched. A `/T` with a period in it is outside the PDF specification. The file is the conversion's own: the inventory and the strip read it, the strip deletes its form, and no caller sees it.

One thing is not done. Two widgets can still come out with one name: the harvest numbers a repeated path `a#2`, and a field can be named `a#2` itself. Those two were an error from pdf-lib, and are now one field at two places, of the first one's kind: a check box named `a#2` after two text fields `a` is read as a place of the second text field.

**Unlock.** A published form that has two widgets of one name.
