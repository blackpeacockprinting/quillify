# Changelog

What a consumer can observe, by release.

## Unreleased

Every entry about a form here means a dynamic form.

### Converts now

- Caps raised to 25 pages and 1,000 fields.
- Forms with a tab, a picture or a dashed border convert. Dotted borders do not.
- An unencodable character keeps `construct: 'glyph'`, with its text as `detail`.
- Captions, borders and rectangles turned by quarter turns convert. Other turns stay `construct: 'transform'`.

### Refused now

- New `construct` values `barcode` and `password`.
- New `detail: 'pixels'` above 8,000,000 picture pixels. A background can reach 32 MB.

### Changed

- Signature fields are kept as kind `signature`: an unbound widget in a quill.
- A `defaultUi` or control-less `<ui>` field becomes text, checkbox or choice. Image fields are left out.
- Dropdowns bound to absent data keep their template's options.
- A field held twice at one place gives one field, no `#2` id.
- Page number and count print ("Page 3 of 3"). No script runs.
- Arial and Helvetica are laid out in Liberation Sans 2.1.5, alike on macOS and Linux.
- Rectangle borders are centered on the edge and keep rounded corners.
- `form.pdf` bytes can differ from v0.2.0's.
- `pdfjs-dist` and the shipped worker are 6.4.299, and must match.
- Package renamed `@quillmark/quillify`, on npm under Apache-2.0. Import from the new name.

### Needs from the host page

- Seven `assets/` files to copy, four Liberation Sans faces new. `sanitize` rejects if one fails to load.
- A CSP must allow `connect-src` for the faces and `img-src blob:` for pictures.

## v0.2.0 - 2026-10-11

Hardening of `sanitize` against large, slow and malformed files.

### Converts now

- Dynamic forms convert where layout threw or hung, and with nameless, subform-named or period-ending fields.
- Dropdown options with `;`, `>` or `|` build, as a string field.
- No longer throws on: untypable or deep field trees, long tooltips, 125,000-entry arrays or dictionaries, malformed crop boxes.
- Crop boxes past the media box no longer move fields.
- Stale object streams convert. A 1 GiB page no longer exhausts memory.

### Refused now

- New code `layout` for dynamic forms pdf.js cannot lay out, reason as `detail`.
- A page with no usable size gives `a page has no size`.
- New code `too_slow` after 60 s on a worker, seconds as `limit`. Calling-thread work is untimed.
- `too_large` with `limit: 67108864` past 64 MiB decoded, written or held by qpdf.
- `damaged` for uncountable streams, a partial qpdf run, pages two readers disagree on, or an object of two kinds.
- `too_many_pages` for an oversized dynamic form before layout, also where it was `unpaintable`.
- `sanitize(pdf)` rejects with `TypeError` for anything but a `Uint8Array`. Other typed arrays and `DataView` now throw.

### Changed

- A static form's `form.pdf` differs in bytes from v0.1.0's.
- Backgrounds carry no `/ID`: `form.pdf` bytes repeat across runs and pass `qpdf --check`.
- Backgrounds keep listed keys per object kind: `/PieceInfo`, `/Namespaces`, `/NS` and references to deleted widgets go.
- Layers keep their default state, without `/Configs`, `/CreatorInfo` or usage. Layer-blind readers show hidden content.
- `Quill.yaml` and `example.md` strings are JSON literals. Lone surrogates become U+FFFD, in `form.json` too.
- `suggest` names same-tooltip options of a group from tooltip and on-state.
- Host-page `zoom` no longer shifts dynamic form reads. `sanitize` rejects if it cannot undo it.
- `sanitize` rejects, where it stayed pending, when the host removes the layout frame early.
- A qpdf crash no longer breaks later files or blocks the page's thread.
- `@neslinesli93/qpdf-wasm` dependency dropped. Its two files ship in the package.

### Needs from the host page

- New asset `assets/qpdf.worker.js`, a classic worker to copy and allow. It fetches `qpdf.wasm`.
- `sanitize` rejects when either is missing, and needs the browser's `DecompressionStream`.

## v0.1.0 - 2026-10-11

The importer of `tonguetoquill/web-app-afa-demo@842ef4207cb5` as a library, on `@quillmark/wasm` 0.124.0.

- `sanitize(pdf)` returns a `Form` (background, page sizes, fields) or a `Refusal`.
- Same-named checkboxes with different on-values become `radio` fields. The second's `id` is `name#2`.
- `suggest(fields)` names fields and `check(fields, naming)` lists problems. A wrong-shaped naming throws `TypeError`.
- `quillify(form, naming)` returns `Quill.yaml`, `form.json`, `form.pdf` and sometimes `example.md`, or the problems.
- Peer dependency: `@quillmark/wasm` 0.124.0 or later.
- `assets/` holds the pdf.js worker (6.3.289, patched), `qpdf.wasm` and a stylesheet. pdf.js's global worker settings are untouched.
- Dynamic forms are laid out in a hidden, sandboxed frame in the host's body.
