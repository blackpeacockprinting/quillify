# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

Harder bounds on a hostile file, and more of a dynamic form's page redrawn.

### Converts now

- A dynamic form with an ellipse, or with a character of Symbol or ZapfDingbats in its text (the triangles, mu, the arrows). U+2010 and U+2011 are drawn as a hyphen. Each was `unpaintable`.

### Refused now

- `damaged`: a page over 14,400 pt on a side, that far from the origin, or with a positive `/UserUnit` other than 1.
- `damaged`: a catalog or page tree that cannot be read as one, a background that would keep an annotation or a page outside the page tree, and an object pdf-lib cannot read.
- `damaged`: an image whose dictionary does not say its size, or says one that is no finite number.
- `too_large`: images count toward the 64 MiB bound, each for the most its dictionary, its JPEG or JPEG 2000 header, or a CCITT image's `/DecodeParms` says.
- `layout` with `detail: 'a field is off its page'`: a dynamic form with a field wholly off its page.

### Changed

- `limits` is exported: `{ bytes, pages, fields }`, the most of each `sanitize` takes.
- A file qpdf cannot rewrite is refused without pdf.js opening it. A PDF cut off mid-file is `damaged`, not `not_pdf`; one whose header starts past its first 1,024 bytes is `not_pdf`, not `damaged`; and a malformed encryption dictionary is refused where `sanitize` threw.
- A dynamic form's page is redrawn in the order the browser paints it. No field moves.
- A soft hyphen inside a line is not drawn, and a stroked rectangle of no width or no height is not redrawn as a bar.
- No background keeps `/UserUnit`.

### Needs from the host page

- Under a content security policy without `img-src data:`, a dynamic form no longer logs an error for each field.

## v0.3.0 - 2026-10-12

More dynamic forms convert, and the package is on npm. Every entry about a form here means a dynamic form.

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
- The tarball carries the license texts of what it redistributes, in `licenses/`.

### Needs from the host page

- Seven `assets/` files to copy, four Liberation Sans faces new. `sanitize` rejects if one fails to load.
- A CSP must allow `connect-src` for the faces and `img-src blob:` for pictures.
