# Using it

11 October 2026, local time. The library at `bcf0cb9`, packed as a release packs it, looked at from the side of the people who use it: the developer who installs it, the app that runs the engine beside it, and the person converting a form in that app. Then what opening the source would take, since the project is to be open source ([#169](https://github.com/tonguetoquill/quillify/issues/169)). What a section calls measured was run here, in headless Chromium and Node 24.15, by scripts outside the repository. What was read on the web has its page beside it, and was read by two readers. Nothing in the package changed.

## What a developer installs

The tarball is 993,947 bytes in 43 files. Unpacked, the four functions are 92,049 bytes of script in 17 modules with 21,017 bytes of declarations, and the three files the package loads at run time are 3,608,102 bytes: `pdf.worker.js` 2,229,041, `qpdf.wasm` 1,334,286 and `qpdf.worker.js` 44,775.

`package.json` has one entry under `exports`, with `types` first, `"type": "module"`, `"sideEffects": false` and `"private": true`. It names no `repository` and no `description`, and its `license` is `UNLICENSED`. It has no `prepack` script, and `.npmrc` sets `ignore-scripts`, under which `npm pack` would run none. So `npm pack` packs whatever `dist/` and `assets/` hold, and a test in the gate is what fails on a build older than the source.

Four small apps were built from the tarball with Vite 8.3.2 and no configuration, each importing what its row names. Sizes are bytes, as written and as gzip.

| The app imports | Script loaded with the page | Script loaded on first use | Files fetched on use |
| --- | --- | --- | --- |
| `suggest`, `check` | 3,227 / 1,498 | none | none |
| `quillify` | 39,338 / 9,194 | none | the engine's core binary, 2,505,458 / 793,899, at the first call |
| `sanitize` | 454,448 / 188,073 | pdf.js, 430,931 / 127,860, at the first file | for each file `qpdf.worker.js` 44,775 / 17,475, `qpdf.wasm` 1,334,286 / 450,360, and `pdf.worker.js` 2,229,041 / 477,199 twice |
| all four | 494,695 / 197,196 | as `sanitize` | as `sanitize` and `quillify` |

pdf-lib is 421,365 bytes of the `sanitize` row. A page that has loaded nothing pays 7.04 MB for its first form converted and assembled, 2.06 MB as gzip, where the second request for the pdf.js worker is answered from the cache, and 9.27 MB and 2.54 MB where it is not. The second file in a page asks for four files again, the qpdf worker, its binary and the pdf.js worker twice. Served as immutable, none of the four reaches the server, and each is compiled again.

Vite copies every file that a module it transforms names by `new URL(…, import.meta.url)`, and does so before it drops unused code. So the app that imports `suggest` and `check` has a script of 3,227 bytes and, in its build, 34,872,425 bytes of files nothing asks for: the two workers, `qpdf.wasm` and the engine's two binaries, the larger of which is its render build at 28,758,865 bytes. The app that imports `sanitize` alone has the engine's two, 31,264,323 bytes. Built against a function's own module in `dist/`, which the `exports` map does not let a consumer name, each app has a script within 41 bytes of the same size and none of those files. A browser never requests them. What they cost is the size of what is deployed.

The pdf.js worker is pdfjs-dist's unminified build with the guards applied. pdfjs-dist ships both: 2,228,489 bytes (477,032 as gzip) and `pdf.worker.min.mjs` at 1,265,413 (374,794). None of the lines the guards look for is in the minified one. The app the exit test builds ships a pdf.js worker of its own beside the package's, of 1,189,577 bytes.

## What the host page has to allow

Measured in Chromium, by serving the build under a content security policy and taking one directive away at a time. With `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'` on every response, DD 2875, DAF 988, DAF 1288, SF 182 and DD 1610 convert and assemble to the same `form.pdf` and `form.json`, by hash, as under no policy.

A worker runs under the policy of the response that served its script, and not under the page's. So the directives fall on two responses:

| Directive | On the response for | What it is for | Without it |
| --- | --- | --- | --- |
| `script-src 'self'` | the page | the app's script and the pdf.js chunk | the page's script does not run |
| `worker-src 'self'`, or none, which falls back to `script-src` | the page | starting the two workers | `sanitize` throws `qpdf.worker.js did not load from` and the URL |
| `script-src 'wasm-unsafe-eval'` | `qpdf.worker.js` | compiling `qpdf.wasm` | `sanitize` throws `qpdf.wasm did not load from` and the URL |
| `connect-src 'self'` | `qpdf.worker.js` | fetching `qpdf.wasm` | the same error |
| `script-src 'wasm-unsafe-eval'` and `connect-src 'self'` | the page | the engine fetching and compiling its binary, in `quillify` | the engine's `init` rejects |
| `img-src blob: data:`, optional | the page | an image that pdf.js's stylesheet names as a `data:` URL | 106 console errors over the five forms, and the same output |

A site that sends one policy on every response needs all of it there. A page that sets its policy in a `<meta>` tag gives a worker none, and `sanitize` then converts under a page policy with no `'wasm-unsafe-eval'`, which the engine's `init` still needs.

`frame-src`, `style-src` and `font-src` can be `'none'`. The frame a dynamic form is laid out in is a `srcdoc` frame with a policy of its own, and it requests nothing. A dynamic form's pictures are `<img>` elements on `blob:` URLs, which the library refuses today ([#42](https://github.com/tonguetoquill/quillify/issues/42)). Once it draws them, `img-src` will have to allow `blob:`.

A worker's script has to come from the page's own origin. Chromium refuses to construct a worker, classic or module, from another origin's script whatever CORS headers that script is served with (`SecurityError`), though it will `fetch` the same URL. So the package cannot be loaded as a module from a CDN, and its two worker scripts cannot be moved to another host by themselves.

## Where the three files are

Each is found by `new URL('../assets/…', import.meta.url)`, written in the source as a constant. `sanitize` takes the bytes and nothing else, so there is no setting. Vite follows the expression in a build and in its dev server, where it pre-bundled the package with no `optimizeDeps` setting. A bundler that leaves the expression as written works once the three files and the engine's binary are copied to where it points from the built chunk: tried with Rolldown 1.2.12 alone.

The other bundlers were read about and not run ([#101](https://github.com/tonguetoquill/quillify/issues/101)):

| Bundler | `new URL('./file', import.meta.url)` | Read at |
| --- | --- | --- |
| Vite | followed, when "the URL string" is "static so it can be analyzed", and in a pre-bundled dependency from Vite 8 on | [assets guide](https://vite.dev/guide/assets.html), [`vitejs/vite#21434`](https://github.com/vitejs/vite/pull/21434) |
| webpack 5 | "webpack creates an asset module too" | [asset modules](https://webpack.js.org/guides/asset-modules/) |
| Parcel 2 | followed, for an argument that "must be a string literal" | [JavaScript](https://parceljs.org/languages/javascript/) |
| Rspack | followed: `javascript.url` defaults to `true` | [module parser](https://rspack.rs/config/module-parser) |
| Rollup | by a plugin: the page gives `import.meta.ROLLUP_FILE_URL_referenceId` as the way to name a file a plugin emits | [plugin development](https://rollupjs.org/plugin-development/) |
| esbuild | a request to bundle such a file, open since February 2021 | [`evanw/esbuild#795`](https://github.com/evanw/esbuild/issues/795) |
| Turbopack | resolved at build time, by one library's account, and one report, closed by a bot, that `{ type: 'module' }` is dropped from a worker | [`ffmpegwasm/ffmpeg.wasm#994`](https://github.com/ffmpegwasm/ffmpeg.wasm/pull/994), [`vercel/next.js#98841`](https://github.com/vercel/next.js/issues/98841), both September 2026 |

Nine libraries that ship a worker or a WebAssembly binary to a browser were read: pdfjs-dist, @ffmpeg/ffmpeg, @sqlite.org/sqlite-wasm, sql.js, esbuild-wasm, mupdf, tesseract.js, onnxruntime-web and @duckdb/duckdb-wasm. Seven document a setting that says where the files are: `workerSrc`, `coreURL` and `wasmURL`, `locateFile`, `wasmURL`, `workerPath` and `corePath`, `env.wasm.wasmPaths`, and a bundle object handed to `selectBundle`. The pages read for @sqlite.org/sqlite-wasm and mupdf name none. Where a page read covers a bundler it is webpack or Vite, and none covers Next.js. One of the nine has a playground, one links a sample project, and onnxruntime-web builds a Next.js app and a Vite app from its package as tests ([`microsoft/onnxruntime#23257`](https://github.com/microsoft/onnxruntime/pull/23257)).

## In Node

The package imports with no DOM. `suggest`, `check` and `quillify` run: `quillify` returned a quill's three files in 23 ms, the engine reading its binary from disk. `sanitize` throws `ReferenceError: Worker is not defined` where it starts qpdf's worker ([#34](https://github.com/tonguetoquill/quillify/issues/34)).

## The engine beside it

**Who starts it.** `quillify` calls the engine's `init()` with no argument on every call, and the engine keeps one promise. A host that hands `init` a source of its own has to call it before the first `quillify`: `init()` and then `init(bytes)` rejects with `runtime::init_conflict`, and the other order resolves. The README does not say so.

**A second copy.** With a byte copy of the engine's package beside the first, a `Quill` made by one copy is refused by the other's `Engine` (`runtime::not_a_quill`), and the tree `quillify` returns loads in both. So the tree is the thing to return. What the peer dependency saves a consumer from is a second binary of 2.5 MB, and a tree checked by one version of the engine and rendered by another.

**What `ok` proves.** `Quill.fromTree` reads `Quill.yaml` and neither of the two assets. Each of these is a tree `quillify` built with one file changed. Each loads in `fromTree` and is refused at render:

| Change | Refused at render as |
| --- | --- |
| `form.json` tagged `quillmark/form@0.1.0`, or `@0.3.0` | `acroform::invalid_form_json` |
| a `schema_field` that names no field | `acroform::dangling_binding` |
| a `form.json` that is not JSON | `acroform::invalid_form_json` |
| a `form.pdf` that is not a PDF | `pdf::parse` |
| `backend: pdfform` | `engine::backend_not_found` |

Nothing in the engine's core build reads the two assets: `quill.validate` on the first of those returns no diagnostic. `engine.open` and `engine.render` read them, and they load the render build, 28,758,865 bytes and 10.3 MB as gzip. In Node that load took 39 ms from disk and an open 5 to 12 ms, and a second `new Engine()` loads nothing. The gate renders every fixture, so the trees the package builds are held against the engine it pins. The engine a consumer runs is not.

**When the engine moves.** The peer range is `>=0.124.0` with no ceiling, which is how the engine's own packages declare it: `@quillmark/quiver` 0.36.0 and `@quillmark/svelte` 0.20.1 both say `>=0.124.0-0`. The engine went from 0.115.0 on 22 September to 0.124.0 on 10 October. The form's tag, `quillmark/form@0.2.0`, is a literal in the assembly, and the engine's `acroform` guide says "any other _version_ is rejected". The gate runs on pull requests, and `.npmrc` holds an install back seven days, so the package learns of a break in the engine when someone moves its pin. A range with a ceiling, raised by the pull request that moves the pin, is the other way to hold a consumer to an engine the gate has seen. It costs a release of the package for each minor of the engine. The migration note for 0.125, which is not released, lists nothing `quillify` calls.

**What the engine's documents ask of this layer.** The `acroform` guide: "Producing a clean `form.pdf` + `form.json` from a raw source PDF (decrypt, strip, extract, verify) is the job of a separate _quillification_ layer". The package decrypts, strips and extracts. It verifies in its gate and not at run time, as above. It goes past the sentence in writing `Quill.yaml` and `example.md` as well. It differs from the guide in one place: the guide's `form.pdf` has its "page `/Annots` removed", and the package keeps the links that lead to an `http` or `https` address or to a place in the file, which the engine takes.

It stops short of the format in two places. The format has unbound `widgets` of four types for a box "a signer fills", and the package writes only signatures there: a field a person does not keep leaves no widget, and nobody can type into its box in a filled copy. And a `schema_field` may be a path into a container or a card, where the package takes one snake_case name for each field.

`borb-sh/quillmark#1979` asks for "a command", and this is a library whose first function needs a browser. `borb-sh/quillmark#1961` asks what the engine should expose "to keep that tool small". The package has three answers: a check of the two assets that does not load the render build, the form's tag as a value, and the rule for the characters an enum value may hold, which the package learned from a refusal.

That issue opens with a question still open: "Is importing a fillable PDF part of Quillmark, or a separate tool?" The engine maintainer's own table of what goes where gives "A fillable PDF form" to another tool, "Generated quill via formalizer", and whether both tools stay was one of the questions left for him when this one began.

Every quill the package builds is version `0.1.0`, a constant. The engine's guide says "Increase versions on every format change". A consumer can read the version from the loaded quill and cannot set it.

**From a tree to a filled PDF.** Five lines, run in Node on a tree `quillify` built, with `Quill` and `Document` from the engine's `init` and `values` keyed by the naming's names. They gave a PDF of 3,015 bytes and no warning.

```ts
const quill = Quill.fromTree(built.tree);
const doc = new Document(`${quill.metadata.name}@${quill.metadata.version}`);
quill.writer(doc).setAll(values);
const out = await new Engine().render(quill, doc, { format: 'pdf' });
const filled = out.artifacts[0].bytes;
```

## The person converting a form

One dialog has been built on the package: the app's, in the clone the exit test uses ([`ACCEPTANCE.md`](ACCEPTANCE.md)). This is a reading of that dialog's source and of the exit test's record, against the package as it is now. No person was watched using it.

**Waiting.** Over the 59 forms the read step took 1.0 to 3.7 s, with a median of 1.6 s, behind a spinner, the file's name and a Stop button. `sanitize` reports nothing until it settles.

**Stopping.** `sanitize` takes no signal, as the importer it was carried from took none. The dialog's Stop ends its call to the naming model and takes the spinner away. A read in flight runs on with its workers and its frame until the file is done or 60 s pass, so a person who stops during the read and picks another file has two running.

**The limits.** The dialog prints "Up to 8 MB, 20 pages, 200 fields" from constants of its own. The package exports no value but the four functions.

**A refusal.** The package gives a code and its data, and the consumer writes the words (the decision "A refusal is a code with its data"). The engine's own failures carry more: each `Diagnostic` has a `code`, a `message` ("Human-readable text") and may have a `hint` ("Optional actionable suggestion"). The dialog has a sentence for each of the eleven codes of v0.1.0. `layout` and `too_slow` have been added since. Its `switch` no longer compiles against the package's types (`TS2366`), a Vite build does not check types, and a person whose file is refused with either code sees a card with a title and no sentence. The exit test's first run type checked the swap, and the dry run on this commit did not. `too_large` now also covers a file that decodes to more than 64 MiB, under a sentence that says 8 MB.

What a person can do after each refusal follows from what the code means, and an app's author has to work it out. This is a reading, not a measurement:

| Code | What a person can do |
| --- | --- |
| `not_pdf` | choose the right file |
| `damaged` | download the file again; a published file refused twice stays refused |
| `password` | open it with its password in a reader, save a copy without one, and choose that |
| `encryption` | nothing, without the certificate it was locked for |
| `portfolio` | save the attachment from a reader that lists it, by the name the refusal gives when the file has one, and choose that; the Air Force's four are rights-managed and have no such copy |
| `too_large` | nothing; `limit` says which of the two bounds the file passed |
| `too_many_pages`, `too_many_fields` | nothing; a dynamic form cannot be split by its pages |
| `no_fields` | nothing: the file has no box to fill |
| `rotated`, `unpaintable`, `layout` | nothing today; a form printed to a flat PDF has lost its fields, and comes back as `no_fields` |
| `too_slow` | try once more when the machine is not busy |

**Naming the fields.** What the dialog shows for a field comes from `Field`: an id, its places as a page and a rect, a tooltip, whether it is required or read-only, and its kind. What a reviewer would want and does not get:

- A picture of the page. It is a recorded choice ([#35](https://github.com/tonguetoquill/quillify/issues/35)). The background is in hand as `form.pdf` and every rect is in the frame of `Form.pages`, so a consumer's own pdf.js can draw one under the rects. Not tried here.
- The printed label. On a dynamic form the caption becomes `tooltip` when the field has no hover text, and nothing tells the two apart. A static form has no label in its field tree ([#36](https://github.com/tonguetoquill/quillify/issues/36)).
- An order. Fields come page by page, in each page's annotation order, and nothing promises it.
- What was left out. A dynamic form's signature fields are left out with their captions ([#43](https://github.com/tonguetoquill/quillify/issues/43)), and the `Form` does not say that anything is missing.

**The first five minutes.** Reading the README as someone who has not seen the project, these are open before a first form converts: how to install it, which the last paragraph answers; how to get the bytes from a `File`; whether to call the engine's `init`; whether a bundler other than Vite works; which directives a page needs, since the table above is in nothing a consumer reads; what the package adds to a page; how long a file takes and whether a call can be stopped; what a person does between `suggest` and `quillify`; what to do with the tree, where a filled PDF is the five lines above; and what a 0.x release may change.

Someone who wants to send a change finds no terms for a contribution, a private tracker behind every `#N`, no word on working from a fork, carried code that is reviewed against a repository they cannot open, a Node version that `.nvmrc` and `package.json` state and CONTRIBUTING does not, nothing on what the gate downloads or how long it runs, no source for the forms `npm run corpus` wants, and a two-commit rule with no example.

Held against the rules the engine's maintainer keeps for his own repositories, this one differs in about ten places. Five of them: it has no `LICENSE`; it has no note for a consumer on a break that no type checker reports, where his releases ship a migration guide; its canon names files and cites issues, where his anchors at folders and cites neither; its `CHANGELOG.md` is not marked `merge=union`; and no test generates its inputs beside a boundary that takes bytes it did not write, where his have a `properties` module there.

## Opening the source

**What each part asks.** Every part with a stated license is permissive. The qpdf script and binary come from a package that declares ISC, ships no license text and names no holder ([#46](https://github.com/tonguetoquill/quillify/issues/46)).

| Part | License | What travels with a copy |
| --- | --- | --- |
| `pdf.worker.js`, pdf.js's worker, changed | Apache-2.0 | the license, and a notice that the file was changed. Both are in the tarball |
| `xfa-layer.js`, lines of pdf.js's stylesheet | Apache-2.0 | the license, which is in the tarball |
| `qpdf.worker.js`, the script Emscripten wrote beside the binary | the wrapper declares ISC; Emscripten's own code is MIT and NCSA ([license](https://github.com/emscripten-core/emscripten/blob/main/LICENSE)) | the MIT notice, and whatever the wrapper's holder would ask, who is not named |
| qpdf 12.2.0, in `qpdf.wasm` | Apache-2.0 ([license](https://qpdf.readthedocs.io/en/stable/license.html)) | the license, and the notices of its `NOTICE.md` for the code it embeds |
| zlib, in `qpdf.wasm` | zlib ([license](https://github.com/madler/zlib/blob/develop/LICENSE)) | nothing is asked of a binary: "This notice may not be removed or altered from any source distribution" |
| libjpeg-turbo, in `qpdf.wasm` | three BSD-style licenses ([license](https://github.com/ImageMagick/jpeg-turbo/blob/7aa2a898c564041a24b09d0a6e780aaa632d08d3/LICENSE.md)) | "This software is based in part on the work of the Independent JPEG Group", in the documentation of a product that ships the binary alone |
| Emscripten's runtime and musl, in `qpdf.wasm` | MIT and NCSA | the MIT notice |
| pdf-lib | MIT | nothing: it is a dependency, not in the tarball |
| `@quillmark/wasm` | Apache-2.0 | nothing: it is a peer |

`NOTICE` already says which texts the tarball lacks: zlib's, libjpeg-turbo's, the runtime's, and the notices qpdf carries for the code it embeds. The script and the binary come from `@neslinesli93/qpdf-wasm` 0.3.0, whose repository has no license file. Its Dockerfile pins emsdk 3.1.74, zlib, ImageMagick's fork of libjpeg-turbo and qpdf 12.2.0.

Apache-2.0 is what the engine, pdf.js and qpdf carry, and it grants a patent license that the MIT and ISC texts do not. The engine declared "MIT OR Apache-2.0" at 0.90.0, on 10 June. By 0.99.0, on 1 August, it declared Apache-2.0 and its repository had moved to `borb-sh`.

**The faces #44 would ship.** pdf.js's `standard_fonts` holds Liberation Sans 1.07.4, under "the GNU General Public License v.2 with the exceptions set forth below" (`LICENSE_LIBERATION`, in pdfjs-dist). The first exception is for a document that embeds the font. Section 3 of that license asks that a copy in object form come with its source or a written offer of it, and one project took the faces out of its releases on that reading (`ClusterLabs/pcs#125`). pdf.js's own note on the files: "Liberation 2.0 and later are licensed under the SIL Open Font License 1.1 instead" ([`standard_fonts/README.md`](https://github.com/mozilla/pdf.js/blob/master/external/standard_fonts/README.md)). Today the package gives pdf.js no standard font data, and pdf.js warns of it five times on DD 2875 and four on DAF 1288. What that does to a measured text run was not measured here.

**The fixtures.** 17 U.S.C. 105(a): "Copyright protection under this title is not available for any work of the United States Government" ([title 17, chapter 1](https://www.copyright.gov/title17/92chap1.html)). [usa.gov](https://www.usa.gov/government-copyright) names the limits: "You also cannot use federal government trademarks or federal government agency logos without permission", and "U.S. copyright laws may not protect U.S. government works outside the country." So for each of the nine: who wrote it, which seals it shows, and which faces it embeds. Two things are recorded already: SF 1152's metadata names its author ([#55](https://github.com/tonguetoquill/quillify/issues/55)), and SF 182 embeds four fonts. Five have no recorded source URL ([#53](https://github.com/tonguetoquill/quillify/issues/53)).

**What becomes visible.** GitHub's page on a repository's visibility: "The code will be visible to everyone who can visit GitHub.com", "Anyone can fork your repository" and "Actions history and logs will be visible to everyone" ([setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)). The page does not list issues, pull requests or releases, which are taken here to follow the code. In this repository that is:

- 245 commits on `main`, 177 of them under an author's own address and 68 merges under GitHub's.
- 169 issues and pull requests, which the README, the changelog and the decisions cite by number.
- 37 `Source:` trailers in the history and nine places in the tree that name `tonguetoquill/web-app-afa-demo`, a private repository a reader cannot open.
- [`AF_EPUBS_FORMS.md`](AF_EPUBS_FORMS.md), [#53](https://github.com/tonguetoquill/quillify/issues/53) and [#54](https://github.com/tonguetoquill/quillify/issues/54), which say how the Air Force's forms were pulled and which hosts answered 403.
- [#47](https://github.com/tonguetoquill/quillify/issues/47), #85, #86 and #139, which describe three defects in pdf.js that nobody has reported to pdf.js.
- The tarball of each release.

**The pdf.js defects.** pdf.js's policy: "Please don't report security vulnerabilities through public GitHub issues", and for the library, "Report the vulnerability in Bugzilla and make sure that the checkbox in the "Security" section is checked" ([security policy](https://github.com/mozilla/pdf.js/security/policy)). Mozilla's [severity ratings](https://wiki.mozilla.org/Security_Severity_Ratings/Client) put "Most Denial of Service vulnerabilities" at low and "Many types of application Denial of Service" at moderate, and say "safe crashes of a content process, like a nullptr deref, are not considered security issues". On a public bug about a hang in the viewer, Mozilla's reply was "content process (only) DOS hangs don't need to be hidden as security bugs" ([bug 2069428](https://bugzilla.mozilla.org/show_bug.cgi?id=2069428)). The three here are a null read, a page set and a page area that call each other without end, and a layout that never ends, each in a file a person has to open. The layout that never ends is the class that reply covers. The other two were not classified: whether a file can make either read or run anything was not looked at. Every guard the build applies still finds its site in 6.4.299 ([#48](https://github.com/tonguetoquill/quillify/issues/48)).

**A registry.** npm's trusted publishing "requires npm CLI version 11.5.1 or later and Node version 22.14.0 or higher" and runs on cloud-hosted runners only ([trusted publishers](https://docs.npmjs.com/trusted-publishers)). "The package you're configuring must already exist on the npm registry" ([`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust)), so a first publish is by hand, and for a private repository "provenance will not be generated". The engine publishes this way. `quillify`, `@quillmark/quillify` and `@tonguetoquill/quillify` each answered 404 on the registry on 11 October.

**Releases.** [SemVer](https://semver.org/): "Major version zero (0.y.z) is for initial development. Anything MAY change at any time." A caret range on 0.x admits one minor, `^0.2.3` being `>=0.2.3 <0.3.0-0` ([node-semver](https://github.com/npm/node-semver)), so a consumer on `^0.2.0` takes each patch and not 0.3.0. The engine's JavaScript packages release by a pull request that promotes the changelog's `## Unreleased` section, tags on merge and publishes (`borb-sh/quillmark-js#734`), and the engine writes a migration guide for a break no type checker reports. [release-please](https://github.com/googleapis/release-please) reads Conventional Commits, which this repository's history does not use. Nothing read favors a release every few changes over one for each milestone.

## Not looked at

Firefox and Safari. Any bundler but Vite and Rolldown. A person using the dialog. Whether the minified worker takes the guards. Whether pdf.js's worker holds the image decoders it keeps under licenses of their own. And three questions that are the maintainer's to take to whoever advises on them: whether an employer has a say in the release, what copyright covers in code written with a model's help, and what export rules ask of someone who publishes the encryption code inside `qpdf.wasm`, for which pdf.js carries an `EXPORT` file of its own.

## What follows

The changes this points at are issues under the v0.4.0 milestone, listed in [#173](https://github.com/tonguetoquill/quillify/issues/173). Each choice that is the maintainer's or the engine maintainer's is a decision there, with its options and the default that holds until it is made. Three things measured here are left as they are, each with what would change that: a caller's stop ([#188](https://github.com/tonguetoquill/quillify/issues/188)), words for a refusal ([#189](https://github.com/tonguetoquill/quillify/issues/189)), and separate entry points, which no consumer has a use for yet.
