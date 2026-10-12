# Changelog

What a consumer of the package can observe, by release.

## Unreleased

### Converts now

- The caps are 25 pages and 1,000 fields, where they were 20 and 200. `limit` carries the new value.
- A dynamic form whose text holds a tab converts, where it was `unpaintable` with `construct: 'glyph'`. A character the standard fonts cannot encode still refuses it, now with its part of the line as `detail`.
- A dynamic form with a picture converts, where it was `unpaintable` with `construct: 'image'`.
- A dynamic form converts with a caption, a border or a rectangle turned by 90, 180 or 270 degrees. A turned field or picture, and a turn on a flowed cell, are still `construct: 'transform'`.
- A dynamic form with a dashed border converts, where it was `unpaintable` with `construct: 'border'`. A dotted border is still refused.

### Refused now

- A dynamic form with a barcode or a password field is refused as `unpaintable`, with the new `construct` `barcode` or `password`.
- A dynamic form whose pictures come to more than 8,000,000 pixels is refused as `unpaintable` with `detail: 'pixels'`. A background can reach 32 MB.

### Changed

- A dynamic form keeps its signature fields: each is a field of kind `signature`, an unbound `signature` widget in a quill, with its caption printed.
- A dynamic form's field with a `defaultUi`, or a `<ui>` that names no control, is a text field, a checkbox or a choice. An image field is left out and its caption printed.
- A dynamic form's dropdown bound to data the file does not hold keeps the options its template lists, where it had one empty option.
- A dynamic form whose template holds a field twice at one place gives one field there, where it gave a second with a `#2` id.
- A dynamic form prints the page number and count a script would write ("Page 3 of 3", not "Page of"). No script is run.
- A dynamic form's Arial and Helvetica are laid out in Liberation Sans 2.1.5, not the browser's fallback face. Lines break the same on macOS and Linux.
- A dynamic form's rectangle is redrawn with its border centered on its edge, and keeps its rounded corners. No field moves.
- A dynamic form's `form.pdf` can differ in bytes from v0.2.0's: borders, page numbers, text and line breaks move.
- The shipped pdf.js worker is built from the 6.4.299 worker, and the package depends on `pdfjs-dist` 6.4.299. pdf.js rejects an open when the two differ.
- The package is `@quillmark/quillify` on npm, under the Apache License 2.0, where it was `quillify`, unlicensed and installed from a tarball. Import from the new name.

### Needs from the host page

- A bundler copies seven files of `assets/`: the four faces of Liberation Sans are new.
- The page fetches the faces for a dynamic form (`connect-src` under a content security policy), and `sanitize` rejects when one does not load.
- A content security policy has to allow `img-src blob:` for a dynamic form with a picture.

## v0.2.0 - 2026-10-11

Hardening: a background is rebuilt from a table of what each kind of dictionary keeps, `sanitize` bounds what a file decodes to and how long it takes, and qpdf runs in its own worker for each file.

### Converts now

- A dynamic form converts where pdf.js's layout threw or never ended: a page area that may occur once, an overflow leader before a row that cannot fit.
- A dynamic form converts when a field has no name, the name of the subform beside it, or a name ending in a period.
- A dropdown with `;`, `>` or `|` in an option builds into a quill, as a string field with the first option as its example and no list.
- `sanitize` answers for a field tree pdf-lib's form API cannot type, a tooltip of any length and a field tree of any depth, where it threw. A hybrid form no longer logs pdf-lib's warning.
- An array or a dictionary of over about 125,000 entries no longer ends `sanitize` with a `RangeError`, and `quillify` writes a choice with as many options.
- A crop box that reaches past its media box no longer moves fields off their boxes, and a malformed one no longer throws. Each page's MediaBox comes from pdf.js's view of the page.
- A file with a stale object stream converts, and a page whose content decodes to 1 GiB no longer runs qpdf out of memory.

### Refused now

- A dynamic form pdf.js cannot lay out is refused as `layout`, a new code, with the reason as `detail`. A page with no usable size gives `a page has no size`.
- A file still waiting on a worker after 60 s is refused as `too_slow`, a new code, with the seconds as `limit`. Work on the calling thread is not timed.
- A file over 64 MiB with its streams decoded, or that has qpdf write or hold as much, is refused as `too_large` with `limit: 67108864`.
- A file with a stream that cannot be counted is refused as `damaged`: a bad Flate stream, an unknown or stacked filter, a false `/ObjStm` or `/XRef` name.
- A file qpdf gives up on partway, or whose pages pdf.js and pdf-lib read differently, is refused as `damaged`.
- A file that names one object as two kinds is refused as `damaged`: a page as a `/Resources`, a content stream as a form, a page or a kept link as a tag.
- A dynamic form over the page cap is refused as `too_many_pages` before a page is laid out, also where an image or a dashed border made it `unpaintable`.
- `sanitize(pdf)` rejects with a `TypeError` for anything but a `Uint8Array`: an `Int8Array`, a `Uint8ClampedArray` and a `DataView` now throw.

### Changed

- A static form's `form.pdf` differs in bytes from v0.1.0's.
- A background carries no `/ID`, so `sanitize` returns the same `form.pdf` bytes on each run, and passes `qpdf --check` with no warning.
- A background keeps a listed set of keys for each kind of object. Private data such as `/PieceInfo` no longer rides into a quill. No page paints differently.
- A background keeps a form's layers and their default state, without `/Configs`, `/CreatorInfo` or a layer's usage. A reader that ignores layers shows content in one that is off.
- A background keeps the form's structure tree under the same table: tags keep their strings, and `/Namespaces`, `/NS` and references to deleted widgets go.
- `quillify` writes each string in `Quill.yaml` and `example.md` as a JSON string literal, so a control character in one builds. A lone surrogate becomes U+FFFD, in `form.json` too.
- `suggest` names two options of one group that share a tooltip from the tooltip and each option's on-state.
- A `zoom` on the host page no longer moves what `sanitize` reads off a dynamic form. Where the zoom cannot be undone exactly, `sanitize` rejects.
- `sanitize` rejects when the host page takes the layout frame out of the document before it loads, where it stayed pending.
- A file that crashes qpdf no longer breaks the files after it, and the page's thread stays free while qpdf runs.
- The package no longer depends on `@neslinesli93/qpdf-wasm` and ships the two files it took from it.

### Needs from the host page

- `assets/qpdf.worker.js` is new: a classic worker a bundler has to copy and the host page has to allow. It fetches `qpdf.wasm` for each file, and `sanitize` rejects when either is missing.
- `sanitize` uses the browser's `DecompressionStream`.

## v0.1.0 - 2026-10-11

The importer of `tonguetoquill/web-app-afa-demo@842ef4207cb5` as a library, on `@quillmark/wasm` 0.124.0.

- `sanitize(pdf)` reads a PDF form into a `Form`: a background with no form layer, the page sizes and one `Field` for each fillable field. Any other file comes back as a `Refusal`.
- Checkboxes that share a name and turn on as different values are one `radio` field each, with the name as `group` and the value as `on`. The second's `id` is `name#2`.
- `suggest(fields)` names each field from its tooltip or its name, and `check(fields, naming)` lists a naming's problems. A naming of the wrong shape throws a `TypeError`.
- `quillify(form, naming)` returns a quill's files (`Quill.yaml`, `form.json`, `form.pdf` and, when a field has an example, `example.md`), or the problems that stopped it.
- `@quillmark/wasm` is a peer dependency, at 0.124.0 or later.
- Each pdf.js read runs on its own worker, started from the one the package ships. pdf.js's global worker settings are untouched.
- The package carries its pdf.js worker (6.3.289 with a null guard at two sites), `qpdf.wasm` and its stage stylesheet in `assets/`.
- A dynamic form is laid out in a hidden, sandboxed frame, so no rule crosses between it and the host page. It is in the host's body while `sanitize` runs.
- The package has one entry point, built to `dist/`. The tarball holds the build, the three assets, `NOTICE` and pdf.js's license text.
