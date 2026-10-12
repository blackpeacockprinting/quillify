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

**Unlock.** For the cost, a published form that converts slowly for it, or the field cap raised (#40). The fields are then made from pdf-lib's own field classes with no search, which took 45 ms for 2,000. For the shared name, a published form that has one.

## 11 Oct 2026: A dynamic form over the page cap is refused before it is laid out

Adds to "The code is carried from the fork".

**Context.** The carried conversion lays out every page of a dynamic form in the host page, reads it, paints it and stamps it, and saves the result. The page cap and the field cap are read afterwards, when the inventory opens that file (#29). A dynamic form's page count comes out of layout, so a template that runs to thousands of pages was laid out in the caller's tab, every page of it, before anything refused it. A built form of 21 pages was refused as `too_many_pages` after the frame had been given all 21.

**Decision.** `xfaToAcroForm` refuses a dynamic form over the page cap as soon as pdf.js has opened it and before the stage lays out its first page, with the refusal the inventory gives: `{ code: 'too_many_pages', pages, limit }`. pdf.js counts a dynamic form's pages as it opens the file, in its worker, so `pages` is the number the inventory read. The inventory keeps its own read of the cap, which is the one a static form meets. The cap is read before the paint, so a form over it that also holds an image or a dashed border is refused for its pages, where it was refused as `unpaintable`.

The field cap stays in the inventory, read from a complete count. #29 also asks that a dynamic form over the field cap be refused at the page where the count passes it, and that is not done. A refusal's `fields` is the form's own count for all three kinds of form, and stopped at the page where the count passes, a dynamic form's would be a running partial. With the pages capped, the layout that comes before the count is 20 pages at most. What one page holds is bounded by the file's size alone.

The open is not bounded by this. The worker lays the form out to count its pages, and a built form of 1,000 pages, one field on each, is refused after 5.9 s where it took 7.5 s. `sanitize` has no deadline (#86).

**Unlock.** For the field cap, a form within the page cap whose fields take the conversion long enough to matter. The count is then read in the conversion's page loop and the refusal says it is a partial. For the open, the deadline of #86.

## 11 Oct 2026: A choice the engine cannot hold is a text box

**Context.** Engine 0.124.0 refuses an enum value that holds `;`, `>` or `|`, with `quill::format_literal_reserved_char`: the character conflicts with the blueprint inline annotation grammar (#88). A choice's options come from the PDF and a naming has no slot for them, so no naming keeps such a field and builds. `check` does not see it coming. The engine is the authority on which characters, so they were measured: with `@quillmark/wasm` 0.124.0, over every code point of the Basic Multilingual Plane in the middle of a value (surrogates left out), and over printable ASCII at the start, in the middle and at the end. Those three are the only ones refused for that reason, wherever they stand. The other 34 refused in that run are the YAML reader's and are written as escapes already. No federal form of the 59 has such an option. DAF 64 has `Training >20 weeks, to include PCS`, AFMC 21 has a row with `;`, and they are the two Air Force files out of 1,354 that end in this refusal.

**Decision.** A choice with an option that holds `;`, `>` or `|` is written as a string field, as a choice with no row but a blank one already is. The field stays and a person types its value. A form rendered from the quill has a text box where the published form has a dropdown, and the quill lists none of the options, the safe ones included, since a string field has no list. The example is still the choice's first option. A choice without those characters is written as before. Replacing the character was not taken: the value typed would no longer be a row of the published dropdown. A test holds the engine's refusal of each character, so the rule is read from the engine and goes the day it changes.

**Unlock.** The engine takes `;`, `>` and `|` in an enum value. The test of its refusal then fails, the choice is written as an enum again, and DAF 64 and AFMC 21 keep their dropdowns.

## 11 Oct 2026: A background's page is the frame the inventory measured

Adds to "A page and a link keep a named set of keys", which folded the `/CropBox` into the MediaBox as the carried strip did.

**Context.** The inventory measures every rect in pdf.js's `view` of a page: the crop box clipped to the media box, or the media box alone when the crop box is no box or lies outside it, and a 612 by 792 page when the media box is no box either. The strip asked pdf-lib for the `/CropBox` as the file writes it and made that the MediaBox. Two readers gave two frames wherever a file is not as the specification wants it. On a 612 by 792 page with one field, built in a test: a crop box of `[-50 0 612 842]` gave a background 662 by 842 under an inventory of 612 by 792 (#28), one of `[700 800 900 1000]`, which lies off the page, became the background's MediaBox as written, a media box of `[0 0 0 0]` stayed the background's under an inventory of 612 by 792, and a crop box that is a number or has three entries ended `sanitize` with pdf-lib's error (the fifth row of #80). The two readers also differ on what a page is. A page that names its `/Type` by reference is a page to pdf.js and to qpdf and none to pdf-lib, so the inventory placed fields on a page the background did not have (#69). The two can also count alike and hold different pages: of three pages under a `/Count` of 2, the second naming its `/Type` by reference, pdf.js reads the first and the second, since it stops at the count, and pdf-lib the first and the third.

No published form on hand shows any of it. Over the 49 of the 59 forms that convert, the views pdf.js gives for the 143 pages are the boxes the strip wrote, number for number. One of those pages has a crop box that differs from its media box: SF 144's first, where it lies inside.

**Decision.** The strip's frame is the inventory's. `inventoryPdf` returns a view of each page beside its size: the object pdf.js read as that page, by number and generation, and the box it measured the page in. `sanitize` hands the views to `stripAcroForm`, and the strip writes view i's box as page i's MediaBox. It reads no box of the file. When pdf-lib's pages are not the inventory's, object for object and in order, the strip refuses the file as `damaged`: that is where both readings are in hand, and it is the one refusal the strip makes. Comparing the objects takes in the count, and it stands in for the comparison by size that #69 asks for, since the strip writes each size and a page of the wrong size under a field is another page. The views stay inside `sanitize`, and `Form.pages` is a width and a height as before.

`stripAcroForm` now takes two arguments, so every test that calls it changes its call: 18 calls in 15 files. A test that holds an inventory passes its views. The others name the box of each page they built, and `viewsOf` in `test/views.ts` pairs it with the object pdf-lib reads as that page. The five cases that planted a `/CropBox` and held the MediaBox to it (one in `strip.test.ts`, renamed to say what the strip does with a frame, and four in `strip-actions.test.ts`) hand the strip that frame, and their assertions stand. What pdf.js makes of a crop box is held in `strip-pages.browser.test.ts`, through `sanitize`. `goldens` and `xfa-isolation` compare the `pages` and `widgets` of an inventory with the golden, where they compared the whole value. No golden changes, and no assertion of `page-identity` does.

**Unlock.** A published form refused as `damaged` for its pages. The strip then has to class a page as pdf.js does, where today it refuses.

## 11 Oct 2026: A frame removed before it loads ends the conversion with an error

Adds to "A dynamic form is laid out in a document of its own", which leaves a frame removed before it has loaded waiting (#99).

**Context.** `sanitize` puts a frame in the host page's body for every file it converts and waits for the frame's `load` event. A frame that leaves the document before then never loads, so the wait had nothing to end it: with the frame removed in the task that made it, `sanitize` was still pending at 8 s. Nothing in the library removes the frame early. A host page that sweeps elements it does not know out of its body would.

**Decision.** While the frame loads, a `MutationObserver` watches the host document's tree. When a change leaves the frame out of the host document, removed or moved to another document, `ready` rejects with an error that says the host page removed the frame before it had loaded, and `sanitize` rejects with it. It is thrown and is no refusal, as the error for a hidden frame is: the file is not what failed. The observer is disconnected when the frame loads or is seen to leave, whichever is first, so it watches the host for as long as the frame takes to load and no longer. The worker is opened only after `ready` settles, so that error leaves none running. A frame that is moved within the host document in the task that made it is still there when the observer looks, and it loads where it lands. The frame goes into the body before the watch starts, so a page with no `body` gets the `TypeError` of the append and nothing is left watching. A frame removed once it has loaded ends the conversion with the error it ended with before.

**Unlock.** None.

## 11 Oct 2026: The frame undoes the host page's zoom, or the conversion ends with an error

Adds to "A dynamic form is laid out in a document of its own", which leaves a zoom on the frame or an ancestor scaling the layout with nothing to report it (#95).

**Context.** No rule of the host page applies inside the frame's document, but a `zoom` on the frame or an ancestor scales what is laid out there. Under `html { zoom: 1.5 }`, of what the two readers return for DD 2875, 271 of 274 text runs differ by up to 1.02 pt, and all 99 boxes and all 78 fields by up to 0.03 pt, with no error. The issue offers two answers: an error whenever the zoom in effect on the frame is not 1, or a layout whose numbers are shown to be the unzoomed ones.

**Decision.** The second where it is exact, and the first where it is not. Once the frame is in the body, the stage reads the zoom in effect on the body (`Element.currentCSSZoom`) and sets the frame's own inline `zoom` to one over it. An inline value beats a host rule on the frame that is not `!important`, so the zoom in effect on the frame is the product of the two. Measured in the Chromium the suite runs, wherever that product reads exactly 1 both readers return what they return on a bare page, every number to the last digit, and DD 2875 reads as its golden: for 0.9, 1.1, 1.25, 1.5, 2, 0.3, 3, 0.75 and 1.3333 on `html`, on `body` and on the frame, and for zooms on two and on three of them at once.

The product is a 32-bit float, and for some zooms no value on the frame makes it 1. At `html { zoom: 1.7 }` it reads 0.99999994, and all 274 runs then differ by up to 0.96 pt and all 78 fields by up to 0.11 pt. Of the 491 zooms from 0.10 to 5.00 in steps of 0.01, 57 are like that. So before a page is measured, `lay` reads the zoom in effect on the frame and ends the conversion with an error that names the host page's zoom when it is not 1. That also covers a `zoom` marked `!important` on the frame, which the inline value does not beat, and a zoom set after the frame was made. It is thrown and is no refusal, as the error for a hidden frame is.

Where a browser has no `currentCSSZoom`, the stage sets no zoom and throws nothing, since it cannot tell a zoom is there. A browser with no `zoom` property has nothing to undo. One that has `zoom` and not `currentCSSZoom` scales the layout with no error, as every browser did before this entry.

**Unlock.** A second step that divides the frame's zoom by the product it reads back brings the product to 1 for 30 of those 57 and leaves 27. It lands when a host page with such a zoom asks.

## 11 Oct 2026: The inventory reads a field's tooltip off the field tree itself

Replaces the carried `tooltipsByField`, which "The code is carried from the fork" brought in as it was.

**Context.** pdf.js reads `/TU` off the widget alone, so the carried inventory asked pdf-lib's form API for each field's: `getForm().getFields()`, then `decodeText()`. That API gives every node of the tree a type and throws on a node it cannot type, and `sanitize` lets an error through only for a bug (#12). A field whose `/FT` is a string or a number or sits on its widget alone, an entry of `/Fields` that is no dictionary, an `/AcroForm` that is a number and a field that is its own kid each ended `sanitize` with pdf-lib's error (#80). `decodeText()` hands every character of a string to one call, so a tooltip of 130,000 characters overflowed the stack (#77). And `getForm()` deletes `/XFA` from the document it reads and says so with `console.warn`, once for each of the 26 hybrid forms among the 59 (#78).

One published form threw, AF 1520, and its field tree is sound: qpdf 12.4 finds 348 nodes in the published file and each terminal one has an `/FT`. Three of that file's object streams carry `/Extends 132 0 R`, a reference to a fourth. qpdf carries the reference into the rewrite, where object stream 44 has `/Extends 473 0 R`, and that keeps the published file's stream 132 in the rewrite as an ordinary stream, object 473, still typed `/ObjStm` and still holding 100 objects under the numbers the published file gives them, 137 to 236. pdf-lib reads every stream of that type as an object stream and assigns what it holds by number, so it reads the rewrite's objects 137 to 142, six text fields, as the published file's `/AcroForm` dictionary, a `/JavaScript` holder, a `/Names` dictionary and three JavaScript actions. All six are kids of a field. pdf-lib stopped on the first, kid 34 of 344: a dictionary with no `/T`, no `/Parent` and no `/FT`. pdf.js reads the rewrite by its cross-reference table and sees the six fields.

**Decision.** `tooltipsByField` walks `/AcroForm` `/Fields` through `/Kids` on pdf-lib's objects, without its form API. It joins the `/T` of each node that has one with a period, as pdf.js builds a field's name, and reads `/TU` where it is a string. A `/T` is decoded as a `/TU` is, which is how the form API decoded it and not always how pdf.js does: a name that opens with a UTF-8 byte order mark or a language escape, or holds a control character, comes out of the two apart, and the widgets of that field inherit no tooltip, as before. What is not the type the walk wants is passed over: an `/AcroForm`, a `/Fields`, a `/Kids` or an entry of them of the wrong type, and a `/T` or `/TU` that is no string. A node is read once, so a tree that loops ends, and the walk keeps a list where the form API recursed. `/TU` is decoded from the string's bytes as `decodeText()` decodes it, UTF-16 after a byte order mark and PDFDocEncoding without one, in pieces of 8,192 bytes or by the browser's decoder.

What stays the same: the tooltip is read from a node that has a `/T`, or from an entry of `/Fields`, and a kid with no `/T` is a widget of the field above it, which is what the form API took for a field. Over the 59 forms the map holds the 4,200 entries it held, each with the tooltip it had, and 8 more on SF 182 and WH-380-E, from fields whose kids are fields and which the form API passed over. No widget carries one of those names, and `sanitize` returns the fields and tooltips it returned for all 59. No golden changes. Two things differ by intent. One is UTF-16 that is not well formed: `decodeText()` drops the code unit after a lone surrogate, and the browser's decoder writes U+FFFD for the surrogate and keeps what follows, as pdf.js does for a widget's own tooltip. The other is a field that has both a kid that is a field and a bare widget. pdf.js names that widget as the field, the form API passed the field over, and the widget now inherits the field's `/TU` where it had none. None of the 59 has such a field.

A tooltip comes back whole, however long. The 8 MiB cap on the file is the bound: a tooltip of 2,000,000 characters is read in under a second, and `suggest` copies a tooltip into a description as it did. Cutting one at a length would be a second rule for a consumer to know, and no measured form needs it: the longest tooltip `sanitize` returns for the 59 is 814 characters.

A tree is read however deep, and a deep one now costs time where it threw. Measured on a chain of fields, each the one kid of the last, with a bare widget under the lowest: with the form API a chain of 2,000 was read, and one of 5,000, 10,000 or 20,000 ended `sanitize` with a `RangeError` in under 1.5 s. The walk reads 20,000 in 1.1 s, and pdf.js then names the widget and reads what it inherits, which the error used to come ahead of. `sanitize` answers with the field in 3.9 s at 5,000, in 17.7 s at 10,000 and in 99 s at 20,000, a file of 1.9 MB. The decision is no cap on depth here. The time is pdf.js's, a cap would be a refusal with a code of its own, and a call that takes too long is the deadline's to end (#86).

**Unlock.** A consumer that shows a tooltip in a place a long one breaks, which is a cap with a number of its own. A deadline for `sanitize` (#86), which bounds a deep tree with everything else. A change of what parses the rewrite for the strip, which would let the inventory read the tree from the same reader.

## 11 Oct 2026: A dynamic form pdf.js cannot lay out is refused as layout

Adds to "The pdf.js guard lives in the worker the package ships", to "The shipped worker is guarded at a third site" and to "The shipped worker keeps a page's first unsplittable node across an overflow leader".

**Context.** pdf.js catches every exception of its XFA layout and only logs it. The count of pages is then read off a list that was never made, so whatever went wrong reached the page as an `UnknownErrorException` saying `Cannot read properties of undefined (reading 'length')`, and `sanitize` rejected with it (#139). Three guards answer the published forms that got there (DAF 1288, the three of #85, DAF 1024). Two inputs still do it with the guards in, neither from a published form: DD 2875 with every `<medium>` of its template rewritten to `long="0.4pt"` or to `short="0pt"`, where the layout reads a content area the page does not have, and a page set whose own `occur` is finite as well as its page area's, where the page set asks itself for the next page until the stack ends. A file anyone can write ended `sanitize` with an error, and the error named neither cause.

**Decision.** Such a form is refused, with a code of its own and pdf.js's reason: `{ code: 'layout'; detail: string }` joins the refusals. `detail` is the message of the exception pdf.js caught, which is the browser's wording and differs between engines. It is text a file can shape, as every other `detail` is.

The reason has to leave the worker, so `npm run assets` changes one more line of it, the sixth: after the line that logs the exception, the catch in `XFAFactory._createPages` throws a new `Error` whose message is `XFA layout: ` and the caught exception's message. The count of pages then rejects where it read the missing list, pdf.js's `loadDocument` rejects with it, and the worker sends it to the page as it sends any failure to open: an `UnknownErrorException` with that message, which is what `getDocument`'s promise rejects with. `openPdf` maps a message that starts with the prefix to the refusal, beside pdf.js's other exceptions, so any stage that opens a file with XFA on answers alike. A file opened with XFA off never runs the layout. The exception's class does not cross: pdf.js rebuilds every error it does not know by name as an `UnknownErrorException`, and pdfjs-dist does not export that class, so the prefix is what the page can tell.

The guards the worker has stay as they are, and nothing else about it changes. A layout that fails is still not repaired: the three published kinds the guards answer convert as before, and these two are refused where they threw.

**Unlock.** None.

## 11 Oct 2026: qpdf leaves a page's content streams apart and writes no object stream

Adds to "Which carried tests change, and how". Replaces the reason the comment carried in `normalize.ts` gives for `--coalesce-contents`.

**Context.** The fork gave qpdf `--coalesce-contents` because its engine painted nothing for a page whose `/Contents` is an array of streams, and five of the nine published fixtures store their first page as eight (#107). At 0.124.0, the floor of the peer range, the engine paints such a page: with the flag off, the share of the first page inked is 0.1009 on DD 1610 and 0.1162 on DD 577, as with it on. pdf.js and pdf-lib read an array as it is. To join a page's streams qpdf has to decode them, and that is where a file makes it allocate (#30). A file of 1,044,108 bytes whose page content is an array of one stream that decodes to 1 GiB ends qpdf with nothing written and its heap grown from 17,235,968 bytes to 1,075,511,296, which the module keeps for the life of the page. Without the flag qpdf copies that stream as stored, in 11 ms, and its heap does not grow.

An object stream is the other thing a reader has to inflate before it has an object. qpdf writes the objects it read from object streams back into object streams unless told otherwise, and pdf.js and pdf-lib each inflate those when they read what qpdf wrote. One can also outlive the rewrite. An object stream may name another it extends, qpdf carries that reference over, and the stream it names comes along as an ordinary object that still says `/Type /ObjStm` and holds the published file's objects under their old numbers. pdf-lib reads every such stream and files what is inside by number, over the rewrite's own objects, where pdf.js reads by the cross-reference table (#149). AF 1520 showed it: pdf-lib read six of its text fields as the published file's `/AcroForm` dictionary, a script holder, a name tree and three script actions.

**Decision.** `normalizePdf` runs qpdf with `--decrypt --flatten-rotation --object-streams=disable`. A page keeps the content streams it was published with, and the file qpdf writes holds every object in the open, so no later stage inflates an object stream and none is left for pdf-lib to read a second time: AF 1520's rewrite has no `/ObjStm` and no `/Extends`, where it had nine and one. That file is larger: DD 1610's goes from 79,265 bytes to 148,070 and SF 182's from 274,632 to 494,666. It is read here and returned to nobody. A static form's background keeps its page's streams apart too, and the ten fixtures' backgrounds grow by 0 to 3,187 bytes.

Two carried tests change. `background.browser.test.ts` holds how many content streams the first page of each background has, eight for DD 1610 and DD 577 and one for the other three, so the engine is shown to paint a page of eight; its header and the comment on `streams` say that in place of saying qpdf joins them. In `normalize.browser.test.ts` one comment loses "and coalesced", and a new case holds that DD 1610, which is published with object streams, is written with none. No other assertion of either changes.

**Unlock.** A version of the engine in the peer range that paints nothing for an array, which the background test then shows.

## 11 Oct 2026: A dynamic form's page with no size is refused as layout

Adds to "A dynamic form pdf.js cannot lay out is refused as layout" and to "A dynamic form is laid out in a document of its own", whose test of a page under a point wide changes.

**Context.** pdf.js lays out a dynamic form whose page area has a `<medium>` of `short="0pt"` and throws nothing. It gives the page no number for either side, the conversion made a page of that size, and `sanitize` ended with pdf-lib's ``TypeError: `width` must be of type `number`, but was actually of type `NaN` `` (#153). A side written with more digits than a number holds does the same for that side. Other sides pdf.js does give a number for and no page can have: a medium of `short="-612pt"` came back as a form whose field sat at x = 1296 on a page 612 wide, and one of `short="0.4pt"`, which pdf.js rounds to a width of 0, as a form on a letter page, because pdf.js reads the empty box the conversion wrote as its default. Each is a file anyone can write, and no published form on hand has one.

**Decision.** `lay` refuses a dynamic form when pdf.js gives a page a width or a height that is not above zero, as `{ code: 'layout', detail: 'a page has no size' }`. It is the code of a layout that throws, since to a caller the two are one thing: a form whose layout cannot be used. `detail` then holds the library's own phrase, where it holds pdf.js's message for an exception. The check sits where the page's size is first read, before anything of the page is put in the frame.

One carried test changes with it. `xfa-isolation.browser.test.ts` held that DD 2875 with every medium 0.4 pt wide converts, to show that a page with no width is the file's and is not taken for a frame the host page hid. It now holds that the form is refused as `layout`, which shows the same thing: the answer names the file and no error blames the host page.

## 11 Oct 2026: qpdf runs in a worker of its own for each file

Adds to "Which carried tests change, and how", to "The pdf.js guard lives in the worker the package ships" and to "The package is one entry point and a tarball of what it names".

**Context.** `normalizePdf` loaded one qpdf module for the life of the page, on the page's own thread, and ran `callMain` on it once for each file (#151). Three things follow from that shape. qpdf's `main` is built to run once in a process: after 386 calls on the sample the module fails for good, and every later file is refused as `damaged`. A file that breaks qpdf leaves the module as it broke: in the suite's Chromium on macOS a page whose `/Group` is arrays nested 200 deep, a file of about 1 kB, traps qpdf, and the sample handed in after it is refused as `damaged`; nested 300 deep, qpdf never returns, and since it runs on the page's thread the page can do nothing more, not even end a test by its timeout. And the module is shared and held: two calls at once use the one heap, which only grows and stays until the page goes, and a slow file holds the page's thread for as long as qpdf takes, 39 to 63 s for a `/Fields` of 300,000 entries in a review's probe.

**Decision.** qpdf runs in a worker of its own for each file, as pdf.js does. `normalizePdf` starts a `Worker`, posts it the bytes, the flags and the URL of `qpdf.wasm`, takes back what qpdf wrote, and ends the worker whatever happened. Nothing of one file is left for the next: no module, no heap, no virtual file. The module cache, the cleanup of the virtual files and the interfaces that typed the module are deleted.

The worker is a fourth shipped asset, `assets/qpdf.worker.js`, a classic worker. `npm run assets` writes it as `dist/qpdf.js` of `@neslinesli93/qpdf-wasm`, unchanged, under a first line that says so and above `src/qpdf-handler.js`, a short message handler. The handler is plain JavaScript under `src/`, as `xfa-layer.css` is a source the assets script reads: Prettier formats it, `tsc` and the tests that walk the `.ts` modules pass over it, and `test/assets.test.ts` holds the shipped file to the installed script and the handler, byte for byte. The script's hash is not asserted as `qpdf.wasm`'s is. The lockfile pins the package's tarball by its integrity, and the hash of the binary is recorded because `NOTICE` and #46 identify a prebuilt binary by it, which the script is not.

A bundler renames both files, so the worker cannot find the binary beside itself. The page resolves `new URL('../assets/qpdf.wasm', import.meta.url)` and the handler gives that URL to the module's `locateFile`. The worker's own URL is held in a constant, for the reason given in "The pdf.js guard lives in the worker the package ships".

The handler catches what qpdf throws, since a file qpdf writes nothing for is an answer. It answers with the bytes qpdf wrote, if any, and moves them to the page. When the module does not start it says so in its answer, and `normalizePdf` throws `qpdf.wasm did not load from <url>` as before. A probe showed why the answer has to carry that: a promise rejected inside a worker and caught by nobody reached the page as nothing at all in 1.5 s, where an error thrown in the handler reached `onerror` at once. A worker script that does not load does reach `onerror`, and `normalizePdf` throws `qpdf.worker.js did not load from <url>`.

What it costs, in the suite's Chromium, the middle of five calls: the sample takes 18.6 ms where it took 0.5, and SF 182, the slowest fixture, 41.7 ms where it took 11.9. Each call asks for the script and the binary again and compiles the binary again. The test server sends both in full every time, and what a consumer's server and the browser's cache make of the second request was not measured.

A file that sends qpdf into a loop is not ended. The 300-deep file still keeps qpdf running for good: `sanitize` stays pending for it and its worker stays busy until the page goes, where it used to stop the page. A file converted beside it or after it is not touched. Ending that worker takes a deadline, which is #86.

No test hands qpdf either file. From about 180 levels of nesting to 499 qpdf traps or loops, and at 500 it writes a file again, which reads as a stack overflowing (#46). What it does at a depth is not qpdf's to say. In the suite's Chromium on macOS the 200-deep file traps and the 300-deep one loops, and of the depths between, some trap and some loop. In Node both loop. In chrome-headless-shell on Linux, the browser the gate runs in on the runner, the trap is a `SIGSEGV` that ends the whole browser, where the same build on macOS and the full Chromium build on Linux throw a `RuntimeError` that the handler catches. So `src/qpdf-handler.browser.test.ts` runs the handler after a stand-in for qpdf-wasm's script: a clean run, a `callMain` that throws, one that writes nothing, and a module that does not start. The two files are probes outside the gate.

Four carried test files change. `test/assets.test.ts` held that the source starts a worker in one place, and now holds two, each from the constant that holds its URL. `test/package.test.ts` adds the asset to what a tarball holds, and holds `NOTICE` to naming the wrapper's version for both of its files. In `src/xfa-isolation.browser.test.ts` the list of what `sanitize` may request gains `assets/qpdf.worker.js` and loses the test server's copy of the wrapper's module, which the page no longer imports, and the case that counts the workers of a conversion whose frame is removed counts two, qpdf's and pdf.js's, where it counted one. `src/qpdf-wasm.browser.test.ts` said in its header that `qpdf.wasm` is requested once in the life of a page. It now holds, in a case of its own, that two calls request `assets/qpdf.worker.js` and then `assets/qpdf.wasm`, twice over, from the page's own origin, and nothing else. Its carried case, that a missing `qpdf.wasm` rejects by name and the next call reads, is unchanged: the browser still answers for a request a worker makes.

**Unlock.** None.

## 11 Oct 2026: qpdf's file is read only when qpdf ends well

Adds to "qpdf runs in a worker of its own for each file".

**Context.** The qpdf worker answered with `/out.pdf` whenever `callMain` returned, and `normalizePdf` took any answer that had bytes as the rewrite (#160). The carried reason was that qpdf exits non-zero on warnings it recovered from, so the test was that a file was written. qpdf writes as it goes, though, and a run that ends with an error partway leaves a file cut short. A page with two content streams, the second under LZW with a first code past the table, is a file of 15,085 bytes: qpdf ends with 2 and leaves 14,916 bytes that stop inside the first stream, `normalizePdf` returns them, and `sanitize` refuses the file as `not_pdf`, though pdf.js opens the original. Named from the catalog, where qpdf reaches it before it has written anything, the same stream gets the file refused as `damaged`.

**Decision.** The handler reads `/out.pdf` when `callMain` returns 0 or 3, and answers with no file otherwise. The codes are qpdf's own: 0 for a clean run, 3 for one that warned and wrote the whole file, 2 for an error. A run that throws answers with no file, as before, and so the file above is refused as `damaged`.

The binary in the package ends with 2 where the command-line qpdf of 12.4.0 warns and goes on. That one copies a stream it cannot decode as stored, and rebuilds a cross-reference table that a wrong `startxref` misses, which the carried test for such a file already records as a file qpdf writes nothing for. The binary ends with 0 on each of the ten fixtures.

**Unlock.** None.


## 11 Oct 2026: The qpdf wrapper is a development dependency

Replaces, in "Dependencies", the place of `@neslinesli93/qpdf-wasm` among what a consumer installs. Its version and its pin stand.

**Context.** Since qpdf runs in a worker (#151), the build imports nothing from `@neslinesli93/qpdf-wasm`. The package ships the two files it takes from it, `assets/qpdf.worker.js` and `assets/qpdf.wasm`, and `npm run assets` and the tests are what read the installed copy. As a dependency it was installed by every consumer, 1.4 MB that nothing of theirs loads, from a publisher they would otherwise not meet (#46).

**Decision.** It moves to `devDependencies`, still pinned exactly. A test holds the rule it follows from: the packages the build imports are the dependencies and the peer dependency, and no other is declared.

**Unlock.** None.

## 11 Oct 2026: A file is held to 64 MiB with its streams decoded

Adds to "qpdf leaves a page's content streams apart and writes no object stream", whose sentence that a Flate stream is copied as stored it replaces, to "qpdf runs in a worker of its own for each file" and to "qpdf's file is read only when qpdf ends well".

**Context.** The 8 MiB cap bounds the file as stored, and Flate can hold 1,032 bytes for each one stored (#30). Files under the cap, each built from bytes, show what that left open. A page of 1.04 MB whose content inflates to 1 GiB came back as a form, and its background decodes to 1 GiB in whatever paints it. A page of 80,000 small content streams, 8.1 MB, kept `sanitize` 24 s and came back as a form with a background of 10.1 MB. An object stream that inflates to 1 GiB grew qpdf's memory to 1,075,445,760 bytes and was refused as `damaged`. And a file of 4.2 MB whose page names 100 images, each stream lying inside the one before it, came back as a form with a background of 420,288,005 bytes: qpdf writes each of the hundred whole, and nothing in it bounds the file it writes.

Two readers stood in the way of counting. The readers of a background do not agree on a Flate stream that ends badly: one whose check is wrong, or cut off, or followed by a stray byte is rejected by the browser's decoder and painted to its end by pdf.js, and one that names a window wider than Flate has, or opens with a stored block whose two lengths disagree, is rejected at its head by zlib and still read through by pdf.js. As `main` rewrites them, 17 of 1,423 published files hold a Flate stream the browser's decoder rejects, 57 streams in all. And pdf-lib inflates a stream whole, with its own decoder and on the page's thread, as soon as it parses one typed `/ObjStm` or `/XRef`, whether or not the file uses it as one. qpdf keeps a stream of that type that the file names as an ordinary object, so a file of 1.04 MB with one that inflates to 1 GiB held the page's thread about 2.3 s of the 3.3 s `sanitize` took, and came back as a form.

**Decision.** One constant, `MAX_INFLATED_BYTES`, 64 MiB, and `normalizePdf` holds a file to it after qpdf has run and before any other reader opens what it wrote.

qpdf gets one more flag, `--recompress-flate`. It decodes every stream under Flate, LZW, ASCII85 or ASCIIHex, alone or chained, and writes it back as one Flate stream of its own. One decoder then says what such a stream holds, and what the later readers get is a stream none of them can read two ways: after the rewrite none of the 57 is left, and the browser's decoder takes every Flate stream of the 1,423 files. A stream qpdf cannot decode ends its run with an error in the binary the package ships, and the file is refused as `damaged`.

The count starts at the size of the file qpdf wrote and adds what each of its Flate streams decodes to. pdf-lib lists the streams. The browser's `DecompressionStream` inflates each one, fed 1 KiB at a time so that it holds 1,032 times that at most, and nothing it gives is kept. Past the bound the count stops and the file is refused as `too_large`, with the constant as `limit` and the sum where it stopped as `bytes`.

What the count cannot take is refused as `damaged` and not guessed at:

- a Flate stream the browser's decoder rejects, which is one qpdf left as it was;
- a stream under any filter but these: nothing, Flate, an image codec (`DCTDecode`, `JPXDecode`, `CCITTFaxDecode`, `JBIG2Decode`), or Flate and then one image codec. Those four are what the rewrites of the published files hold. RunLength is not among them, alone or after Flate: qpdf decodes it only at a level that holds the output whole in memory, and no published file has one;
- a stream typed `/ObjStm` or `/XRef`. With `--object-streams=disable` qpdf writes none of its own, so one that is there came with the file. It has to be found before pdf-lib parses the file, so the bytes are searched for a name that is one of the two or begins with one, wherever it stands and in every spelling pdf-lib reads as them: each letter as it is or as `#` and its code. qpdf writes a letter as itself, but it also writes a `#` it could not read as it is, so `/##34FbjStm` in a file comes out as `/#4FbjStm`, which pdf-lib reads as `/ObjStm`. A rewrite that holds the bytes somewhere else, in a string or in an image's data, is refused with it. None of the 1,423 does.

qpdf is held to the same bound while it runs, in what it writes and in its memory. The handler counts each write qpdf makes, and the write that takes the count past the bound ends the run: the file of 100 images is stopped once qpdf has written 64 MiB of the 420 MB it was going to. The module gives the handler one way in, its `FS.write`, which the handler wraps, and a test on a file of that kind fails if a later build of the module writes by another road. The worker then answers with one size, that count or the size qpdf's memory grew to, whichever is more. Past the bound the file is refused as `too_large` with that size as `bytes`, whatever qpdf then wrote: an object stream of 128 MiB of white space leaves a rewrite of a few hundred bytes behind a memory of 269,156,352. After each of the 1,423 published files the memory is 17,235,968 bytes, the size it starts at.

The largest of the published files comes to 15,046,490 bytes as counted (DAF 57: a rewrite of 4,975,419 and 10,071,071 decoded). The bound is about 4.5 times that.

What it costs. Every stream is now deflated again, in WebAssembly, and the count parses the rewrite once more with pdf-lib (#39) and holds the page's thread while it runs. Over the published files, the better of two runs each, `normalizePdf` takes 27.2 ms at the median where it took 22.9, 147 ms at the ninetieth percentile where it took 38, and 443 ms at the most, for DAF 57, which took 52. Most of that is qpdf: its run on DAF 35, the next slowest and a file of 5.1 MB, is 369 ms where it was 30. The rewrites are smaller, 555,292,346 bytes in sum against 585,606,999, and a static form's `form.pdf` with them: SF 182's background is 403,873 bytes where it was 408,506.

One test file that is on `main` changes. `src/qpdf-handler.browser.test.ts` gives its stand-in module a heap of five bytes and a `write`, hands the handler a limit of ten bytes, and each answer it expects carries a size.

Left outside the bound, and listed in `SECURITY.md`: qpdf's memory before the file is refused, since it reads an object stream whole; qpdf's time, about 4 s for each GiB a file decodes to, with no deadline (#86); an image's pixels (#163); and what pdf.js inflates of a file qpdf wrote nothing for, when it opens the original to say why (#164). One thing more rests on a reader: the count takes pdf-lib's word for which objects are streams, and a file pdf-lib could not parse after qpdf wrote it would end `sanitize` with pdf-lib's error. No file built for it, and none of the 1,423, is such a file.

**Unlock.** A published form that is refused for any of it: one that comes to more than 64 MiB, one with a stream under RunLength or under another chain the count does not take, or one whose rewrite holds the two names in the open. For the search of the bytes, a successor to pdf-lib that parses a file without inflating anything (#45). And for the cost, a consumer the slowest tenth matters to: qpdf can then leave Flate streams as stored, as it did, and rewrite them only for a file with a stream the count rejects, which is 17 of the 1,423.

## 11 Oct 2026: One table says what a background's dictionaries keep

Adds to "A page and a link keep a named set of keys", which lists at the top of `strip.ts` the keys of a page tree node, a page, a link and a link's action, and leaves what a kept value holds with v0.2.0.

**Context.** The strip cut the catalog, a page tree node, a page, a link and a link's action to a set of names each, and kept whole whatever a kept key held: a sweep from the catalog followed every reference and deleted only what it never met (#25). So a `/Resources` kept any key the file gave it with the object under it, an entry of `/XObject` could be a stream of any subtype, a form kept an application's private data under `/PieceInfo` with the date beside it, and a stream kept an `/F` that names a file outside. Built in a test, each of the four survives the strip. Nothing said what an object was, either: one stream could be a page's content by one key and a form by another, and a dictionary written inside `/Kids` that names its `/Type` by reference, which pdf-lib reads as no page, stayed in the page tree as the file wrote it. A list of names for each of these, with a call that cuts to it, is a second and a third copy of one rule, and the sweep beside them is a second walk of the same objects.

**Decision.** One table and one walk. `KINDS` in `strip.ts` is data: for each kind of dictionary, the keys it keeps and what each key leads to. A key leads to a value that leads nowhere (a number, a name, a string, a boolean, null, or an array of those, read through any reference, and never an array that holds itself), to one dictionary or stream of a kind, to one or an array of them, to a dictionary of them by name, to a reference back to one the walk reaches by another key, or to `*`, a value no row reads yet, which is kept whole as everything under a kept key was. `STREAMS` names the kinds that are streams and `STREAM` the keys any of them keeps beside its own. `PICK` names the key that tells one kind from another, a `/Type`, an `/S` or a `/Subtype`, and it is read through a reference. A value that leads nowhere stays under any listed key, where a kind is expected too: a mask can be an array of numbers. An array of a kind holds that kind and no array, so an array inside one is refused as any other wrong entry is. Nothing a page paints from nests one.

The walk starts at the catalog and goes level by level through a queue, with no recursion. It gives each object the first kind that reaches it, deletes every key that kind does not list and every value that is not what its key leads to, and when the queue is empty deletes every object it did not reach, which is what the sweep did. What is kept whole is walked after every row is done, so an object a row reaches has its row whatever else names it. Whether a value leads nowhere is read once for each reference, so a chain of arrays, each named by the one before, costs its length. A key that reaches an object as a second kind is deleted. The six sets of names and the calls that cut to them are gone: they are the rows `catalog`, `tree`, `page`, `link`, `uri` and `goto`.

An object has one kind, the first that reaches it, so a page that some other key reaches first is no page: a page tree's `/Resources` that names a page takes it out of `/Kids`. The same holds for a page tree node or a `/Kids` array that another key reaches first, with every page under it. The background would then hold fewer pages than the views name, and a field would be stamped on the wrong page. Such a file is refused as `damaged`: when the queue is empty, every page the views name has to have been reached as a page.

What is more than a list stays as code beside the walk. The pages are compared with the views and each is given its MediaBox. A link stays only when it leads one way to an address or to a place, and its action is a copy. A page is one of the pages so framed, so the dictionary written inside `/Kids` is none. The loop that deletes outright an annotation or a page the tags still name stays until the structure tree has rows.

The first rows past those four are `resources` with its name maps, `content`, `image` and `form`, and what the dictionary of any of those streams keeps, `Length Filter DecodeParms`, with a row for a `/DecodeParms`. A form's `/PieceInfo`, `/LastModified` and `/Metadata` are in no row, and neither is a stream's `/F`, `/FFilter` or `/FDecodeParms`. An image and a form keep `/OC`, which is the layer they are drawn in, and the `/StructParent` or `/StructParents` that ties their content to the tags. Everything else a row reaches is `*`: a font, a graphics state, a color space, a pattern, a shading, a transparency group, a border, a destination, the layers, the property lists of marked content under `/Properties`, the structure tree and the mark information. Each pull request after this one replaces some `*` with rows, and the last holds that none is left.

Three things now hold of the kinds that were cut before. A key that leads to no dictionary keeps a value that leads nowhere, where a `/Rotate` or a `/Rect` could reference any object. A `/Parent` stays only when it names a page tree node the walk reached. A link's action is cut by the row its `/S` picks, where the strip copied two keys by name. No test of the strip changes, carried or not.

Measured outside the gate, each background built by the strip as it was and by the walk, and every page painted by pdf.js at scale 1 with no annotation drawn. Over the ten fixtures and the 49 of the 59 forms that convert, no pixel differs and one background changes: SF 2809 loses `/PieceInfo` and `/LastModified` from 16 forms, with the streams they reached. Over the 798 Air Force files that convert, 11 backgrounds change. They lose `/PieceInfo` and `/LastModified` from 5 forms in 2 files, `/ADBE_FillSign` from 6 forms in 3 files and `/Name` from 31 images in 6 files. No pixel differs in 797 of those files. The other is AF 4006, whose two backgrounds are the same bytes: pdf.js paints that one file two ways. Every other background is byte for byte what the strip wrote before, and none is larger. The pull request has the byte counts and the timings, each with the commit it was taken on.

**Unlock.** A published form that paints from a key its row lacks. The page-identity test or the comparison over the published forms shows a changed pixel, and the key joins the row.

## 11 Oct 2026: A row reads an array by position

Adds to "One table says what a background's dictionaries keep", whose rows are dictionaries and streams and whose `PICK` reads a name.

**Context.** The rows for what a `/Resources` reaches take the place of the `*` of a font, a graphics state, a color space, a function, a shading, a pattern and a transparency group (#25). Most are dictionaries and streams, which the table already reads. Two are arrays whose parts differ by where they stand: a color space (`[/ICCBased profile]`, `[/Separation name space function]`) and the `/Font` of a graphics state (`[font size]`). A function, a shading and a pattern say their type in a number, where a font says its subtype in a name. And two values would each need several kinds of their own: a halftone under a graphics state's `/HT`, which is one of five types of dictionary and stream, and the attributes of a `/DeviceN`, its fifth part, which name colorants, a process space and mixing hints.

**Decision.** A kind whose keys are numbers is an array, and the walk reads it by position: `ICCBased` is `0 1:icc` and `fontsize` is `0:font 1`. Such an array loses every part past the last its row lists, so a part no row reads keeps no object in the background. A part before that which is not what its position leads to becomes null, so the parts after it stay where a reader looks for them. Both hold for an array that holds a dictionary or a stream somewhere. One that holds nothing but numbers, names, strings, booleans and nulls leads nowhere, and stays as written at any length, as it does under every listed key. `PICK` reads position 0 of an array as it reads a key of a dictionary. A kind is picked by a name where `PICK` writes a name and by a number where it writes a number, so a shading whose `/ShadingType` is the name `/2` is no shading. `HT` is a key that leads nowhere: the name `/Default` stays, and a halftone dictionary or stream goes with the key. A `/DeviceN` has four positions, so its attributes go.

A color space can hold a color space, its base or its alternate, so arrays of a kind now stand one inside another. Whether a value leads nowhere is asked of each on the way down, so the answer is remembered for an array as it is for a reference, and color spaces written one inside another cost their size.

More keys can now reach a page before the page tree does, a page's `/Group` among them. The entry before refuses such a file as `damaged`, and that holds for each of these rows.

Measured as the entry before measured, against the strip as it was before either. Over the ten fixtures and the 49, no pixel differs and one more background changes: DAF 2096 loses `/Type` from 4 font files. Over the 798 Air Force files, no pixel differs and 21 more backgrounds change. The rows delete `/Bezier` from 116 Type 0 fonts and `/FontInfo` from 116 CID fonts in 9 files, and `/Type` from 37 font files in 13. No graphics state of the 857 loses an `/HT`, and no array read by position loses a part or has one made null. The pull request has the byte counts, each with the commit it was taken on.

**Unlock.** A published form that paints differently without its halftone or without the attributes of its `/DeviceN`. The comparison over the published forms shows the pixel, and the value gets rows of its own.

## 11 Oct 2026: sanitize refuses a file whose worker is still busy after 60 seconds

Adds to "qpdf runs in a worker of its own for each file" and to "A file is held to 64 MiB with its streams decoded", whose sentence that qpdf's time has no deadline it replaces.

**Context.** Nothing bounded the time a stage takes, so a file could keep a worker busy for as long as it liked while `sanitize` waited (#86). The published form that showed it, DAF 1024, converts since the shipped pdf.js worker was guarded. Files built from bytes show the general case. A field tree 20,000 deep, a file of 1.9 MB, keeps pdf.js 99 s. A file whose `/Fields` holds 300,000 entries keeps qpdf 39 to 63 s. qpdf takes about 4 s for each GiB a file's streams decode to, and a file of 3,072 bytes holds a GiB under two Flate filters. 200 dropdowns that share 20,000 options, a file of 50 kB, take 4.3 s, and larger ones were still running after 20 s. And a page whose `/Group` is arrays nested 300 deep, a file of 1,194 bytes, is one qpdf does not return from in the suite's Chromium on macOS (#46): it was still running after 60 s, and `sanitize` stayed pending on it with its worker busy. A dynamic form that never finishes also left its frame in the host page's body.

**Decision.** A file that has `sanitize` waiting on a worker 60 s after the call is refused: `{ code: 'too_slow'; limit: number }` joins `Refusal`, with `limit` in seconds. The limit is one constant, `MAX_SECONDS`, 60, beside the other caps, and there is no option for it. Of the 59 published forms the slowest goes through `sanitize` in 2.7 s here (SF 2809, 18 pages and 106 fields), and the 59 take 33 s together, so 60 leaves a slow machine about twenty times the slowest.

`sanitize` makes one signal for each call, with `AbortSignal.timeout`, and hands it to the stages as a last parameter that a caller of one stage may leave out. A stage that waits on a worker ends the worker when the signal fires and throws the signal's reason: qpdf's worker in `normalizePdf`, and pdf.js's in `openPdf`, for the open and for every question put to the open document after it. pdf.js settles no question that was pending when its worker ended, so `openPdf` gives its callers `within`, which a stage awaits each such question through. `close` puts a last question to the worker, whether it has closed, and awaits that through `within` as well, then ends the worker whatever the wait came to. An open that begins after the signal has fired throws the reason before it starts a worker, since a listener put on a fired signal is never called. The frame goes as it does on any other exit, in the conversion's `finally`. Each stage takes its listener off the signal when its worker ends.

In its `catch`, `sanitize` makes `too_slow` of the signal's reason and of nothing else. A refusal or an error that a stage came to on its own is returned or thrown as it is, also after the signal has fired. A worker that reports an error as it is ended is not read as an asset that did not load, because the listener on the signal rejects with the reason before the worker is ended.

What the signal cannot end is work on the page's own thread: the count of what qpdf wrote, pdf-lib's parsing, the strip, the stamping of a redraw, the layout in the frame and the two readers of it. A signal fires only when the thread is free, so such a piece runs to its end, and the file is refused where the call next waits on a worker. The strip is the last stage and starts none. The decision is that a call that has reached it returns what the strip gives, a form included, however long the strip took: nothing is left to end by then, and the form is done. So `sanitize` keeps no clock of its own beside the signal, and a call can settle later than 60 s. In a probe, the sample under a limit of 500 ms, with the strip's save made to hold the thread 1.5 s, came back as a form after 1.8 s and after 2.0 s in two runs. The caps on pages and fields, the cap on size and the bound on what a file decodes to are what hold those pieces.

A test shortens the wait by standing in for `AbortSignal.timeout`, so the source has one way to set it. A worker that never answers is a stand-in as well, one that is handed none of its messages, or none of one kind, so that pdf.js goes silent after the open: at the metadata, an attachment, a page, a page's annotations or its close. For such a worker the stand-in signal fires a tenth of a second after the first message it was not handed, so a case does not turn on how fast the machine got that far. What qpdf does with the nested arrays depends on where it runs, and chrome-headless-shell on Linux exits on a WebAssembly trap, so no test in the gate hands qpdf a file that makes it trap or loop.

**Unlock.** A published form that needs longer than 60 s on a consumer's machine. The limit then becomes an argument of `sanitize`. And a file that keeps the calling thread long under the caps, which reopens what the deadline covers.

## 11 Oct 2026: A border, a destination and the layers have rows

Adds to "One table says what a background's dictionaries keep" and to "A row reads an array by position". Replaces one sentence of "A background keeps its layers": `/OCProperties` is no longer kept whole.

**Context.** Six values under a link, a page and the catalog were `*` in the table: a link's `/Border` and `/BS`, a destination, the catalog's `/OCProperties`, an `/OC`, and the entries of a `/Properties` (#25). Built in a test, each keeps an object no reader looks at: a dictionary as the third part of a destination, a dictionary where a destination has its page, a key of a `/BS`, an alternate configuration under `/Configs`, a key of the default configuration, a group that only `/Order` names, and a key of a property list.

What the 1,413 published files hold there, each read as published with qpdf. A `/Border` is an array of numbers on all 116 links that have one, and a `/BS` has `Type W S` or `W` alone. The 11 destinations are all a `/GoTo` action's `/D` of one shape: a page, `/FitR` and four numbers. 31 files have `/OCProperties`, with `OCGs` and `D` and never `/Configs`. A default configuration has `AS BaseState ON OFF Order RBGroups` and no other key: `/Order` is empty or a flat array of groups, `/RBGroups` is empty, and no reference in one names a group that `/OCGs` does not list. A group has `Type Name Intent Usage`. A usage dictionary has `Print`, `View`, `Export` and `PageElement`, and in 78 groups `CreatorInfo`, which names the application that wrote the layer. A membership dictionary has `Type` and `OCGs`, one reference, and in AF 3822 one of the two names a group that `/OCGs` does not list. An entry of `/Properties` is a group in 13 cases and an empty dictionary in 8, all 8 in two files that are refused, DAF 2522 for its count of fields and SPF 4446A for having none.

The table could not say two of these. A destination's page and a configuration's groups are references to objects another key has to reach, and they stand in arrays, where the table had a back reference only as a key of a dictionary. And a property list that is neither a group nor a membership dictionary says so by no `/Type` at all.

**Decision.** Each of the six has a row, or is a key that leads nowhere.

- `/Border` leads nowhere: an array of numbers stays, with a dash array in it, and anything else goes. `/BS` is a `border`, `Type W S D`.
- A destination is an array read by position, `0:^page 1 2 3 4 5`, in a link's `/Dest` and in a `/GoTo` action's `/D`. Its first part is a reference back to a page the page tree holds. It is not a page by this key: a file whose page only a destination reaches is still refused as `damaged`. A first part that is no such page becomes null, and the link stays and leads nowhere, as it did when it named a page the strip had deleted. The parts after it lead nowhere, a part past the sixth goes, and a destination that holds no reference stays as written.
- A back reference in an array is settled as one in a dictionary is, when the queue is empty, and becomes null where the key of a dictionary is deleted. `Key:[^kind]` is one such reference, or an array of them and of arrays of them. A part that leads nowhere stays, which is a label in `/Order` and the operator of a `/VE`. Null and not removal, because `/Order` and `/VE` nest and a part's place says what it is. An array is read once: two keys that name one array by a reference both keep it, and a second reference to it from inside an array becomes null, so none is left holding itself. An array that `/OCGs` or a membership dictionary's `/OCGs` names too stays under both keys, whichever the file writes first: by the time a back reference is settled the walk has cut that array to groups. An array that a key of any other kind names is that key's, as an object has one kind, and the configuration loses the key that named it. Where that key is `/OFF`, a layer the file turns off reads as on. None of the 857 backgrounds measured below loses a key of its configuration.
- The layers are `layers` (`OCGs D`), `config`, `auto` for an entry of `/AS`, `ocg`, `usage`, `state` and `ocmd`. `/Configs` goes: a background has one configuration, the default. A configuration's `/Creator` and a usage dictionary's `/CreatorInfo` go, as the trailer's `/Info` does. A usage dictionary's `/Zoom`, `/Language` and `/User` go too. No published file has one, and each would be a dictionary with a row of its own. An `/AS` entry whose `/Category` still names one of the three then changes no layer. A group is an entry of `/OCGs`, an `/OC` or an entry of `/Properties` that says `/Type /OCG`, or an entry of a membership dictionary's `/OCGs`, so the watermark of AF 3822 keeps the group it is drawn in. A reference to a group in the default configuration, in an `/AS` entry or in a `/VE` stays when the walk reached that group one of those ways.
- `PICK` can name a last kind, for what is told as none of the others. An `/OC` or an entry of `/Properties` that is neither a group nor a membership dictionary is `marked`, a property list of marked content, whose row is empty: it stays as a dictionary with no key. The name a content stream marks its content with still resolves, and nothing hangs under it. Every such entry in the published files is an empty dictionary already.

A layer keeps its default state: the test of "A background keeps its layers" passes as it was written. One test of the strip changes. `src/strip-kinds.test.ts` held that what a property list and a destination name is kept whole, through a dictionary, an array and a stream, beside the tags. It now holds that for the tags alone.

Measured outside the gate, each background built by the strip as it was and with these rows, and every page painted by pdf.js at scale 1 with no annotation drawn. Over the ten fixtures and the 49 of the 59 forms that convert, no pixel differs on 172 pages and 7 backgrounds change: each loses `/CreatorInfo` from its 2 groups. Over the 798 Air Force files that convert, no pixel differs on 1,229 pages and 6 backgrounds change, which lose `/CreatorInfo` from 50 groups. Nothing else goes: no other key, no part of a destination, no reference to a group. Every other background is byte for byte what the strip wrote before. Nine of the ten rows meet a background among the 857, and `marked` meets none. The pull request has the byte counts.

The structure tree and the mark information are the `*` that are left.

**Unlock.** A published form whose property list holds a key, such as an `/MCID` that ties its content to the tags: the key joins the row. A reader that stops at a null in `/ON`, `/OFF` or `/Order`: the reference is then removed and the parts after it move up. A consumer that needs an alternate configuration. A published form whose layer turns on by zoom, language or user: the key joins `usage`, with a row for what it holds.

## 11 Oct 2026: A file that reaches one object as two kinds is refused

Replaces two rules. In "One table says what a background's dictionaries keep": an object has the first kind that reaches it, and a key that reaches it as a second kind is deleted. In "A border, a destination and the layers have rows": an array that a key of any other kind names is that key's, and the configuration loses the key that named it.

**Context.** The walk cuts an object to the keys of its kind when it reads it, so a second key that reached the object as another kind had nothing of its own left to read, and was deleted (#170). Which of the two keys won was the order the walk met them in. A file can use that to take a reference out of its own background. With `/OFF` and a graphics state's `/TR` naming one array by a reference, the array is read as the `/TR`'s and left with no group in it, the default configuration loses its `/OFF`, and a layer the file turns off is on: in a probe pdf.js paints 40,000 dark pixels of a square that the source hides. A page that names one stream as its content and, under `/XObject`, as a form keeps the content and loses the form. So a background could show what a reader of the source never showed, or leave out what it did.

Counted over the published files, each taken through the stages before the strip, with a copy of the strip that notes each such reach and changes nothing else. Of the ten fixtures, the 59 and the Air Force files, which are 1,354 and 1,351 distinct by SHA-256, each counted once, 886 reach the strip. In none does a key reach an object that has another kind, and in none does a reference of the default configuration name an array that has one.

**Decision.** Such a file is refused as `damaged`. A key that leads to a kind, and names an object the walk has given a kind, has to reach it as that kind. Where it reaches it as another, or as none of its own, `claim` throws the refusal where it deleted the key.

The kind of a reach is told as before, by the key and by what `PICK` reads off the object. For an object that has a kind, that is the object as its row left it. A `/Font` entry that names an image the walk has reached is therefore refused too, though an image is no font however it is read: once the image is cut to its row, nothing says what it held under another key. The other order is not refused. A key that reaches first an object that is no kind of its own is deleted, as it was, and the object is there for the key it belongs to. So the rule refuses every file in which the order of two keys could change what the background keeps, and with them a file that names an object of one kind, already read, where another kind belongs.

The same holds when the queue is empty. A reference of the default configuration that may be an array (`/ON`, `/OFF`, `/Order`, `/RBGroups`, `/Locked`, the `/OCGs` of an `/AS` entry, a `/VE`) reads an array as its own unless the walk cut it to a list of groups. Where that array has any other kind, the file is refused, where the key was deleted or the part made null.

What does not change. Two keys of one kind share an object, as two pages share a `/Resources` and two fonts a descriptor. A value that leads nowhere stays under every key that names it. A key that leads to no kind and names a dictionary is deleted whatever else names that dictionary. A reference back to one object that the walk did not reach as its kind is deleted or made null: a destination's first part that is no page, a `/Parent` that is no page tree node, a group in `/Order` that no other key reaches.

The rule that every page the views name has to be reached as a page stays. A page that another key reaches first, and a page tree node or a `/Kids` array above it that another key reaches first, are now refused at that reach. One way to lose a page is left, and it is no second kind: the loop that deletes annotation lookalikes outright deletes a page tree node that has a `/Rect`, and the pages under it are then in no `/Kids` the walk reads. A test builds that file.

Four tests of the strip change. Two in `src/strip-kinds.test.ts` and two in `src/strip-paint.test.ts` held that an object two kinds of key name keeps the first: a page's content that is a form too, an image that is another image's `/JBIG2Globals`, a font that is a graphics state, and one file with a CMap that is a font file, a color profile that is a function and a shading that is a pattern. Each file is now held to the refusal, the last as three files.

**Unlock.** A published form in which two keys of different kinds name one object. The count over the published forms is run again when the corpus grows, and a pair it finds is read from a copy for each key, or kept under a rule for that pair.

## 11 Oct 2026: The structure tree has rows

Adds to "One table says what a background's dictionaries keep" and to "A border, a destination and the layers have rows", whose last `*` these rows replace.

**Context.** The structure tree and the mark information were the two values the table still kept whole (#25). Built in a test, each of these stays in a background: a key no reader of tags knows on an element, with a stream under it, an entry of the parent tree that names any object at all, and a key of the mark information that references one. And every object reference that named a widget still held its `/Obj`, a reference to an object the strip had deleted. A later writer can make such a reference resolve: the engine numbers what it stamps from the trailer's `/Size`.

A design study weighed deleting the tree whole against keeping it under rows. A form filled from a quill carries the background's tags, and two readers read them: Poppler prints the same structure for the published file, the background and the rendered form, and pdf.js returns every content leaf and every link leaf. So the tree is not dead weight, and the decision is to keep it, typed.

What the published files hold, read with qpdf. A root has `Type K RoleMap ParentTree ParentTreeNextKey`, in 14 files of the 59 `IDTree`, in 8 `ClassMap`, and in 9 Air Force files `Namespaces`. An element has `S K P Pg A ID Lang Type Alt T C E ActualText`, and in those 9 files `NS`. Only 1,348 of 22,697 elements say `/Type /StructElem`. An attribute dictionary has `O` and 33 other keys, each a number, a name, a string or an array of those. An object reference has `Type Pg Obj`. A node of the parent tree has `Kids Nums Limits` and one of the ID tree `Kids Names Limits`. The mark information has `Marked`, and in one file `Suspects`.

**Decision.** Nine rows and one entry of `PICK`.

- `marks` is `Marked Suspects`. `tags`, the root, is `Type K IDTree ParentTree ParentTreeNextKey RoleMap ClassMap`. `/Namespaces` goes, with an element's `/NS`: both would need rows for a namespace and its role map, and nine files have them.
- `elem` is `Type S P ID Pg K A C T Lang Alt E ActualText`. An entry of a `/K` is picked by `/Type` as `mcr` (`Type Pg MCID`) or `objr` (`Type Pg Obj`), and what says neither is an element, since most elements say no type. A number in a `/K` is the number of a marked content and leads nowhere.
- `attributes` is `O` and the 33 keys the published files have. It is an entry of an element's `/A` and of a `/ClassMap`.
- `parents` and `ids` are the nodes of the parent tree and of the ID tree: `Kids` and `Limits`, and `Nums` or `Names`.
- The strings stay: `/Alt`, `/ActualText`, `/E`, `/T`, `/ID`, `/Lang`. They are what the tags are for. They are also text no page shows, which is the one thing a person who looks at the pages does not check, and `SECURITY.md` says so.

The tree names what lies outside it by references back, so the tags can keep nothing in the background that the pages do not. An element's `/P` is a reference back to an element or to the root, written `^elem|tags`: a back reference can now name two kinds. `/Pg` is one to a page. An object reference's `/Obj` is one to a link. The entries of `/Nums` and `/Names` are references back to elements, in arrays that can hold arrays, as the references of the default configuration are. So an element is what the root's `/K` reaches, and an entry of either tree that names anything else is made null. An element that only those trees name, or only another such element's `/P`, is deleted.

An object reference that is left with no `/Obj` says nothing, so it goes from its element's `/K` with it. That cannot wait for the queue to empty, where a back reference is settled, because by then nothing knows which `/K` held it. So the walk reads an object reference as one only where its `/Obj` names a link the page loop kept, beside the line that reads a page as one only where that loop framed it. Any other is no kid, and is taken out of the `/K` as any wrong entry is. The element stays, with no `/K` where that was its only kid.

Two shapes join the table's grammar for two keys of the root. `RoleMap:{}` is a dictionary by name of values that lead nowhere, a role's name here. `ClassMap:{[attributes]}` is a dictionary by name of one of a kind or an array of them. A slot is now read by taking one layer of brackets off its spelling, where it took off all of them.

The loop that deletes outright, before the walk, every indirect object that reads as an annotation or as a page, and is neither a page of the views nor a link that stays, is kept, and with it the check that every page the views name was reached as a page. The rows do part of its work: an object reference to a widget is taken out of its `/K`, and an element's `/Pg` to a page outside the page tree is deleted. They do not do all of it. A dictionary by name keeps every plain value under whatever name the file wrote, so a widget that `/RoleMap`, `/ClassMap` or a page's `/Font` names as that dictionary would be read as one and keep its `/Subtype`, `/FT`, `/T`, `/V` and `/Rect`, and a widget that the tags name where an element belongs would be read as an element and keep its `/T`. With the loop no such object is in the file when the walk starts, whatever names it, and the key or the entry that named it goes as one that names nothing. A page of the page tree or a kept link that the tags name as an element is two kinds, and the file is refused.

The loop reads objects, so a dictionary written in place is not its to delete, and a field that has no `/Rect` and says no `/Subtype /Widget` does not read as an annotation. Either one, under a key that leads to a dictionary by name, keeps its plain values. No `/Annots` and no `/AcroForm` lists it, so no reader presents it as a field, and `SECURITY.md` says so under what is not handled.

One test of the strip changes. `src/strip-kinds.test.ts` held that what the tags name is kept whole, through a dictionary, an array and a stream: that test goes, and `src/strip-tags.test.ts` holds each row.

Measured outside the gate, each background built by the strip as it was and with these rows, and every page of a background that changed painted by pdf.js at scale 1 with no annotation drawn. Of the ten fixtures 6 backgrounds change, of the 49 of the 59 forms that convert 30, and of the 798 Air Force files 117: no pixel differs on the 20, 99 and 187 pages of those. What goes: 294, 2,221 and 5,423 object references, every one that named an object the file does not hold, and with each its place in a `/K`, which leaves 252, 2,102 and 5,384 more elements with no kid; 346, 776 and 16 dictionaries that read as elements and that no `/K` reaches from the root; and `/Namespaces` and `/NS` in 9 Air Force files. No other key of any row goes. The elements the root's `/K` reaches are the same before and after, 1,985, 14,681 and 28,020, and so are the numbers of marked content under them. The 9, 46 and 2 object references that are left each name a kept link. On each page of the six tagged fixtures pdf.js's `getStructTree` returns the tree it returned before, less its 109 leaves for an object that is not there. The Air Force figures are of a strip that had the rows and not the loop. On the ten fixtures and the 49, that strip and this one write the same bytes.

**Unlock.** A published form whose tags carry a key its row lacks: the key joins the row, as a marked-content reference's `/Stm` would with a form that tags the content of a form XObject. A reader that needs `/Namespaces`. The engine tagging what it stamps: until it does, a filled form's fields are in no structure element, and the `Form` elements here are empty.

## 11 Oct 2026: pdf.js is pinned at 6.4.299

Adds to "Dependencies", whose pin of `pdfjs-dist` it replaces, and to "The pdf.js guard lives in the worker the package ships", whose unlock named this move.

**Context.** `pdfjs-dist` was pinned at 6.3.289, and 6.4.299 had not been held against what this package does with pdf.js (#48). The guards are applied by exact text and the build stops when one does not find its line, so taking a release is a deliberate change. Between the two unminified builds, 15 files under `src/core/xfa/` and `src/display/xfa_layer.js` differ in 153 lines, and each difference is a statement written another way: two `return`s made one conditional, two tests joined, a `let` moved into its block. Outside the XFA code more changes, in the worker's annotation, font, function and image code, in the message handler both sides share, and in the page's canvas code.

**Decision.** The pin is 6.4.299. Each guard finds its line in the new worker the number of times it is written for, six sites in all, so `scripts/assets.js` does not change. The three defects the guards answer are still in 6.4.299. A worker built with one guard left out, served to the suite's tests in place of the shipped one, does this:

- Without the two null guards, DAF 1288 is refused as `layout` with `Cannot read properties of undefined (reading 'Symbol()')`, and its golden and its two tests fail.
- Without the page set's line, the built form whose one page area may occur once is refused as `layout` with `Maximum call stack size exceeded`.
- Without the two lines of `handleOverflow`, the two built tables with an overflow leader are still being laid out when their tests time out at 20 s.

With every guard in, the same 28 tests pass. So no guard goes, and the worker's notice keeps its sentences.

One test changes: `test/assets.test.ts` holds the first line of the shipped worker to the version by name, and now names 6.4.299. No golden moves, so no value does: the three dynamic fixtures inventory as their goldens record.

The stage's stylesheet is copied again. The XFA rules are lines 1270 to 1588 of the new `web/pdf_viewer.css`, where they were lines 1267 to 1585. 201 of the 319 lines differ, each by a space before a `{` or after a `:`, and the two copies are the same text with spaces and tabs taken out. Chromium parses both to the same 57 rules.

What this package uses of pdf.js reads the same in both builds: `getDocument` takes `data`, `enableXfa`, `ownerDocument` and `worker` as it did, a `PDFWorker` made from a port starts as it did, and the code that fills the fields the inventory reads off an annotation, the document's `IsXFAPresent` and `IsCollectionPresent`, `XfaLayer.getPageViewport` and the classes and attributes the two readers of the layout look for have no changed line. Three changes lie on a path the package takes and showed in no measurement. The worker's first message, `ready`, carries an empty `Uint8Array` where it carried null, and a `PDFWorker` made from a port does not read it. A cross-reference stream whose `/W` holds a negative width, or three zeros, is a format error where it was read. A text field with no `/Q` of its own takes the form's, which the inventory does not read.

Measured outside the gate, with the build of each pin. The 59 forms come out as the manifest records under both, 49 converted and 10 refused. Of the Air Force's 1,354 files, each has the same outcome under both: 813 converted, 234 `too_many_fields`, 157 `no_fields`, 132 `unpaintable`, 14 with problems from `quillify`, 4 `portfolio`. Each refusal is the same value for value, the count of fields and the construct that could not be painted included. `sanitize` returns a form for 827 of them, 605 dynamic, with 55,830 fields at 55,836 places on 1,275 pages. Under both pins every field has the same id, kind, page and rect, no value moves, and every background is the same bytes.

pdf.js rejects an open when the page's copy and the worker are of different releases, so the worker the package ships and the `pdfjs-dist` a consumer installs move together, as the exact pin has them.

**Unlock.** The next release of pdf.js. Taking it is this again: the diff of the two builds, each guard found or shown to be no longer needed (#47), the gate, and the two runs over the published forms.

## 11 Oct 2026: The caps are 25 pages and 1,000 fields

Replaces the caps of 20 pages and 200 fields, which "The code is carried from the fork" brought in as they were (#40).

**Context.** The fork capped a form at 20 pages because each page went to a model as an image, and at 200 fields because that was as many as one naming call was measured to get right. This library sends nothing to a model. Of the 59 published forms 8 are over the field cap, and of the Air Force's 1,354 files 230 are, more than for any other reason (#54). Nothing measured the cost of a larger form, so this entry does, with the caps lifted in a probe outside the repository and in no commit.

**Decision.** Each cap is a round number a quarter above the largest published form on hand that goes through every stage in under 20 seconds. A stage that turned worse than linear, or a form that took longer, would stop the field cap short of that.

Each of the 237 distinct published files over 200 fields (the 8 and the 230 share one, AF 1466) went through `sanitize`, `suggest`, `quillify`, and the engine opening the quill and rendering it blank, one at a time in headless Chromium on the machine the gate runs on. They hold 201 to 2,039 fields. 226 went through every stage, the largest at 999 fields (AETC667, 0.84 s). The slowest took 2.05 s in all (AF4160, 820 fields on 11 pages, 2.01 s of it `sanitize`), and the median took 0.61 s. Over the 226 the stage maxima are `sanitize` 2.01 s, `suggest` 7 ms, `quillify` 24 ms, opening the quill 11 ms and the render 112 ms. The other 11 hold 1,009 to 2,039 fields, and `quillify` returns their problem: the engine (0.124.0) takes at most 1,000 fields in a block, as `'main' declares 1008 fields; a card-yaml block carries at most 1000`.

A form built to the same size shows no stage worse than linear. Each size was run twice, and the figures are the second run. A page of 250, 500, 1,000, 2,000 and 4,000 text fields took `sanitize` 0.36, 0.50, 0.73, 1.2 and 2.2 s as an AcroForm, and 0.47, 0.73, 1.2, 2.3 and 4.5 s as a dynamic form. `suggest` took 3 ms and `quillify` 41 ms at 4,000. Past 1,000 the engine refuses the quill, so the engine is the one stage not measured at 2,000 and 4,000. At 1,000 it opened in 9 ms and rendered in 18.

The field cap is 1,000. A quarter above 999 is 1,250, but the engine takes 1,000 and no more, so a form that `sanitize` returns above that would end in a problem from `quillify`, which the cap exists to say first. A quill declares at most one field for each of a form's fields, so the engine does not refuse a form at the cap for its number of fields. It can still refuse one for something else: a form of 1,000 dropdowns that share one list of 1,000 options gave a quill past the engine's node budget (`quill::yaml_parse_error`), and two Air Force files end in `quill::format_literal_reserved_char`. The stage that is the limit is the engine's. The refusal for the 11 above it stays `too_many_fields`.

The page cap is 25. pdf.js's page count of all 1,395 distinct files on hand runs to 19 (AF1174, which `sanitize` refuses as `unpaintable`) and 18 (SF 2809, which converts, 106 fields, 2.6 s in all, and SF 85, which has no field). A quarter above 18 is 22.5, and the round number is 25. A built form of 25, 50, 100 and 200 pages, one field on each, took `sanitize` 0.33, 0.33, 0.37 and 0.45 s as an AcroForm and 0.44, 0.60, 0.93 and 1.7 s as a dynamic form.

The refusal codes do not change, and `limit` in each names the new value. `corpus/manifest.test.ts` changes with the corpus: the 8 forms refused for their fields are expected to convert, so 57 convert and 2 are refused, and the totals take in their 54 pages, 2,878 fields and 2,838 places. `src/caps.browser.test.ts` writes both caps out as numbers, where the tests that built a form from `MAX_PAGES` and `MAX_WIDGETS` follow the constants. `corpus/af-epubs.manifest.json` is the record of one run and stays as it is.

Memory is not measured. Time is the one cost this entry bounds.

**Unlock.** A published form over either cap, which needs the measurement again. A newer engine that takes more than 1,000 fields in a block moves the field cap with it. A consumer whose review step cannot take a form of 1,000 fields reads `form.fields.length` and decides for itself.

## 11 Oct 2026: A dynamic form's redraw is held to its layout on rules, borders and fills

Adds to "A dynamic form is laid out in a document of its own" and to "A dynamic form's check box is the square the browser paints". Changes one test of `src/display-list.browser.test.ts`.

**Context.** For a static form the gate holds every pixel of the background to the page it came from. For a dynamic form that page is the redraw, so nothing set what `displayList` and `paint` drew beside what the layout shows (#110). The redraw left out every rectangle with a fill and no border while the suite and the corpus run passed (#106). Set side by side, the two show the next difference at once: an SVG `rect` is redrawn as a box of its own size with the border inside it, as a CSS border lies, where SVG centers a stroke on the rectangle's edge (#111). The three dynamic fixtures hold 8 such rectangles among their 246 boxes, with strokes of 0.5, 1.22 and 1.5 pt, and 6 of their 8 pages differ from the layout for it.

**Decision.** `src/xfa-redraw.browser.test.ts` paints each page twice, at 2 pixels to the point, and holds the two pictures together. The browser paints the layout: the page's elements are moved out of the frame into an SVG image with the stage's stylesheet, and the image is drawn on a canvas, since a frame's own pixels cannot be read. pdf.js paints the redraw. Text is left out of both, because the layout is set in the form's faces or a fallback and the redraw in the standard 14 (#44): in the layout by a rule that makes it transparent, and in the redraw by giving the canvas a `fillText` that draws nothing, which is the call pdf.js sets a face with no file through. A control is left out of the layout, as the redraw leaves it to the widget. The square of each check box and radio button, with a pixel round it, is not compared: the layout has the browser's control there and the redraw a square of its own, which `src/xfa-check.browser.test.ts` holds to its place.

Two counts are held to zero on every page. Ink: a pixel at least 10% dark in one picture with no pixel a third as dark, and at least 10% dark, within one pixel of it in the other. Fill: a pixel in a 5 by 5 area that is even in both pictures, to 8 levels of 255, where the two colors differ by more than 12. The second is what a missing fill leaves, however light. The tolerance is the one pixel, which is half a point. The image is laid out at one pixel to the point, and there the browser paints a border from a whole pixel: one the layout puts at 17.5 pt is painted from 18. The redraw has it where the layout computed it, and the two painters antialias a rule differently. With no tolerance the 8 fixture pages differ by 7,030 to 41,515 pixels with every box in place, and at one pixel by none. So a border that is out of place by half a point or less passes. At 1 pixel to the point a rule under a point wide is less than a pixel, and DAF 988 then differs on each of its pages by 896 to 1,642 pixels, so the pictures are at 2.

The test runs the three fixtures and a form built in it. No fixture holds a rectangle with a fill, so the built form has one with a fill and no border, the shape #106 lost, and one with a 6 pt stroke over a fill. A second case pictures the layout of two filled rectangles beside the redraw of a form with one of them, and holds both counts above zero, so a redraw with a box left out fails the comparison. At this entry the test fails on 6 fixture pages, by 2,467 to 7,211 pixels of ink, 29,162 in all, and on the built form by 4,940 of ink and 3,744 of fill.

An SVG `rect` becomes a box half its stroke larger all round, so the border that `paint` draws inside the box lies centered on the rectangle's edge. The fill grows with the box, and what it gains lies under the stroke. `src/display-list.browser.test.ts` held a stroked `rect` to a box of its own size. It now holds a `rect` with a 6 pt stroke to a box 3 pt larger all round, and a `rect` with no stroke to its own size. On the fixtures the 8 boxes move out by 0.25, 0.61 and 0.75 pt and the test passes. Nothing else of what `displayList` and `harvestWidgets` return for the 8 pages changes, and no golden does: a golden holds pages and fields, and no field's rect moves.

What the test does not see. The image lays the page out again, with the faces of the machine: a face the form embeds does not reach it, so a rule placed after text in such a face can sit elsewhere in the picture than in the layout the redraw read. With the text left out, text that a fill covers, or that covers a fill, shows in neither picture. Whatever lies in the square of a check box is not compared. And a rule or a border that is less than 10% dark and under 2.5 pt wide is in neither count: it is no ink, and it has no even area of 5 by 5 pixels. A 2 pt border of gray 232 that the redraw lacks passes.

Measured outside the gate, by a probe that is not in the repository, with the test's comparison over published forms as the library was before the border moved and after. Of the 16 dynamic forms among the 59 that convert, 9 differ from their layout on 23 of their 38 pages before and 3 on 4 after. The probe read the Air Force files anew and is not the recorded run of `465a328`, which has 590 dynamic forms that convert: 605 convert at this entry. Of the 605, 449 differ on 646 of their 938 pages before and 90 on 124 after, and no page differs by more pixels than it did. Of the 90, 54 have a fill and a border or a rule stacked the other way round in the redraw (#111), and 32 differ by 30 pixels or fewer, at a corner of a frame or where two hairlines meet. The pull request has the counts.

**Unlock.** A published form whose rules move when the image lays it out again: the layout is then pictured another way, by a screenshot of the frame, which needs a command of the test server. A browser or a pdf.js that paints a rule more than a pixel from where it does today: the tolerance is measured again.

## 11 Oct 2026: A dynamic form keeps its signature fields and the captions printed in them

Adds to "The pdf.js guard lives in the worker the package ships" and to "A dynamic form's fields are stamped flat, each under its whole name".

**Context.** pdf.js writes no HTML for an XFA signature control, and its `Field` returns the field's bare box when the control gives none, before the caption is attached. So a dynamic form's signature field reached the quill as nothing, and the caption printed in it was not on the redrawn page (#43). The three dynamic fixtures show 20 such fields, 7 on DD 2875, 7 on DAF 988 and 6 on DAF 1288, and nine of them have a caption with text. A static form's signature field was carried all along: the inventory reads a widget whose `/FT` is `/Sig`, and the assembly writes it under `widgets` in `form.json` with the type `signature` and binds it to nothing.

**Decision.** A signature field of a dynamic form is a field of kind `signature` at its control's box, and its caption is printed where the form prints it.

- `npm run assets` changes a sixth line of the worker, at one site, seven sites in all. Where a field's control gives no HTML and the control is a signature, the control is a `label` holding an empty `div` of class `xfaSignature`. The field then goes the way a field with a text control goes: pdf.js attaches the caption, places it by its `placement`, and gives the `div` the room that is left. The `div` has its width inline, since the stage's stylesheet is a verbatim copy and has no rule for it.
- `harvestWidgets` reads each such `div` as a widget of kind `signature`, after every control of the page. A signature field can share its SOM path with a control, and a path that repeats is numbered in the order read, so reading the signatures last leaves every other field the id it had.
- `stamp` writes it as a dictionary of five keys, `/FT /Sig`, `/Subtype /Widget`, `/T`, `/Rect` and a `/TU` when the field has a tooltip, in the page's `/Annots` and the form's `/Fields`. pdf-lib has no class that creates a signature field. The keys are the ones the inventory reads, and the strip removes the whole form layer after it.

The goldens of the three dynamic fixtures gain entries, each of kind `Sig`: DD 2875 gains 7 (78 to 85), DAF 988 gains 7 (159 to 166) and DAF 1288 gains 6 (116 to 122). No existing entry moved: every line a golden held is in it as it was, in the same order, and the new lines follow the entries of their page. The one line that changes is the last of each file, which gains a comma. The carried tests that count these forms' fields change with them: `src/sanitize.browser.test.ts`, `src/worker.browser.test.ts`, `src/xfa-isolation.browser.test.ts`, `src/xfa-layout.browser.test.ts` and `src/xfa.browser.test.ts`, each a count of 78, 116 or 159, of DAF 1288's kinds or of its tooltips. `test/assets.test.ts` lists the worker's new line. `corpus/manifest.json` changes in 14 rows, 73 fields in all, and `corpus/manifest.test.ts` holds the new totals, 6,678 fields at 6,581 places.

Measured outside the gate, with the build before and after, on the tree this was written on, where the caps were 20 pages and 200 fields. The 59 forms: 49 convert and 10 are refused under both, and the 14 dynamic forms with a signature field gain 73 fields, each read back from the engine's render at its rect. Every tenth file of each of the Air Force's lists in name order, 143 files, through `sanitize`: each has the same outcome, 93 forms, 24 `too_many_fields`, 14 `no_fields` and 12 `unpaintable`. The 93 forms hold 5,634 fields before and 5,732 after. 26 of them gain 98 fields, all of kind `signature`, and no field is lost or has another id, kind, page or rect. Two of the 24 refused for their count name a higher one, 431 to 435 and 285 to 298. No form of the 143 goes over the cap for it.

Two things are not done. A signature field's box is what pdf.js leaves the control, and pdf.js gives a caption that reserves room and holds no text none of that room. DAF 988's seven signature fields have such a caption, so each box starts where the caption's room starts, and four of the seven lie over the text field beside them by 43 to 68 points. And what a published form says signing a field locks is not carried, as for a static form (#124).

**Unlock.** A pdf.js release that writes HTML for a signature control: the line and its sentence in the worker's notice are deleted in the change that takes it, and the harvest reads what pdf.js writes. For the box, a consumer that places a signature by the widget's rect on a form whose caption reserves room with no text.

## 11 Oct 2026: Each control of a dynamic form is a field, is left out by a rule, or is refused

Adds to "A dynamic form keeps its signature fields and the captions printed in them", whose guarded line it widens, and to "A refusal is a code with its data".

**Context.** A field whose control is a barcode, a password edit, an image edit, a `defaultUi` or an empty `<ui/>` left the conversion with no widget and without the caption printed in it, and nothing was refused (#114). It goes the way a signature field went: pdf.js writes no HTML for the control and returns the field's bare box. The templates of the 946 dynamic Air Force forms show 81 fields with an empty `<ui/>` in 11 forms and 8 with an `imageEdit` in 5, and none with a barcode, a password edit or a `defaultUi`. `form.json` has four kinds, text, checkbox, choice and signature.

**Decision.** What each control of a dynamic form becomes:

| Control | In the Form | Its caption |
| --- | --- | --- |
| `textEdit`, `dateTimeEdit`, `numericEdit`, or no `<ui>` | text | printed |
| `checkButton` | checkbox, or radio in an exclusion group | printed |
| `choiceList` | choice | printed |
| `signature` | signature | printed |
| An empty `<ui/>`, one holding only `extras` or a `picture`, a `defaultUi` | what no `<ui>` gives: text, with one list of items checkbox, with two choice | printed |
| `button` | no field | printed |
| `imageEdit` | no field | printed |
| `barcode` | the page is refused as `unpaintable`, `barcode` | |
| `passwordEdit` | the page is refused as `unpaintable`, `password` | |

The first four rows and the button are as they were. The others are decided here.

- A field with no control of its own is a field a person fills: pdf.js has the rule for a field with no `<ui>` and did not apply it to one that is there and empty. `npm run assets` changes a seventh line of the worker, at one site, so that it does. Whether Acrobat shows a text control for such a field was not looked at, and the XFA specification was not read.
- An image field has no kind in `form.json`. A static form's image field is a push button, which the inventory leaves out, and a dynamic form's goes the same way with its caption printed, which is the instruction a person follows on paper. One that holds an image is refused as `image`, by the rule the redraw already has.
- A barcode is print computed from what was entered, which the redraw cannot draw, and a password field as a text field would show and store what the form hides. Neither is in a published form measured here, so the refusal costs no form. One the form does not show refuses the page too: the check does not ask whether the control is visible.
- The line guarded for a signature now gives every control with no HTML a box, of class `xfaSignature`, `xfaBarcode`, `xfaPasswordEdit` or `xfaImageEdit`. `harvestWidgets` refuses the page for the second and third, and reads no field for the fourth. The worker differs from the installed one at seven lines, eight sites.

No carried test and no golden changes. `test/assets.test.ts` lists the worker's two lines, `corpus/manifest.json` changes in one row, DAF 707 from 70 fields to 79, and `corpus/manifest.test.ts` holds the new totals, 6,687 fields at 6,590 places.

Measured outside the gate, with the build before and after, on the tree this was written on, where the caps were 20 pages and 200 fields. The 59 forms through `sanitize`: each has the same outcome, 49 forms and 10 refused, DAF 707 gains nine text fields, and no field of the 49 is lost or has another id, kind, page or rect. Every tenth file of each of the Air Force's lists, 143 files: each has the same outcome, and the 93 forms have the same 5,732 fields, none gained, lost or moved. One refusal names another construct: DAF 465 was `unpaintable` for a `glyph` and is now `unpaintable` for the `image` one of its image fields holds.

**Unlock.** A published form with a barcode or a password field: the control then gets a kind, here or in the engine's form schema. A consumer that fills an image field. Acrobat showing another control than text for an empty `<ui/>`.

## 11 Oct 2026: A dynamic form is carried as pdf.js lays it out, whatever a script or a binding would add

Adds to "A dynamic form pdf.js cannot lay out is refused as layout" and to "The pdf.js guard lives in the worker the package ships".

**Context.** pdf.js runs none of a form's scripts, and it empties a list that is bound to data the file does not hold. What a script or the data would put on the page at layout is not in the layout, so it is not in the quill, and nothing was decided about it (#121). A count over the templates of the Air Force's 946 dynamic forms, read with qpdf and matched by pattern, says how common each case is. 814 have a script: 688 one that runs when the document is ready, 97 a `calculate`, 75 one that runs when the layout is ready. 14 have a script that sets a `presence` before or at layout, and 10 of those convert. 67 print a page number that a script writes into a hidden field, and 34 of those convert. One, DAF 1288, binds a list to data (`bindItems`), in its two grade boxes.

**Decision.** A dynamic form is carried as pdf.js lays it out. Nothing is refused for a script or a binding, and `sanitize` returns nothing new for one. A refusal for a script that runs before layout would take most dynamic forms, and a narrower one cannot tell what a script does without running it. Two cases can be computed without running a script, and they are.

The first is a list bound to data the file does not hold. pdf.js's `_bindItems` removes the items the template lists before it resolves the binding's `ref`, so the list ends empty. `npm run assets` changes a seventh line of the worker: `_bindItems` returns before it removes anything unless a `bindItems` with no `connection` has a `ref` that resolves to a node. DAF 1288's grade boxes bind to a `Grade` node the published file does not hold, and each comes out as a dropdown of the twenty grades its template lists, where it had one empty option. The form's golden records the twenty in both boxes and nothing else in it moves, and `test/assets.test.ts` lists the line. This reads a binding with no data as leaving the template's items. That reading was not checked against the XFA specification, and what Acrobat shows for the two boxes was not looked at (#17). Of every tenth Air Force file, 143, each has the same outcome with the guard as without, and the 93 forms `sanitize` returns have the same 5,634 fields, id, kind, page, rect and options, on backgrounds of the same bytes: DAF 1288 is the one form of the 946 with a `bindItems`.

The second is the page number, in an entry of its own.

What stays as laid out, by the same count: the 14 forms whose early script sets a `presence`, where the layout can hold what Acrobat hides; 5 whose lists a script would fill from a data connection; 2 whose footer counts master pages; every `calculate`; and the scripts that run at signing, which write nothing a blank form prints.

**Unlock.** DAF 1288 set beside Acrobat (#17): if Acrobat shows the two boxes empty, the line goes and the golden goes back. A pdf.js release that leaves a template's items when a binding finds no data takes the line out the same way (#47). A form whose laid-out page misleads the person filling the quill reopens whether to refuse it or to name the construct in the result.
