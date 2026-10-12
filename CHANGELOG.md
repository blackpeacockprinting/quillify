# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- In a dynamic form's text a soft hyphen (U+00AD) inside a line is no longer drawn as a hyphen, and a non-breaking hyphen (U+2011) is drawn as one. A form with U+2011 was `unpaintable` with `construct: 'glyph'`.
- A file qpdf cannot rewrite is refused without pdf.js opening it, which held 1.5 GiB for one file of 0.5 MB. A PDF cut off mid-file is now `damaged`, not `not_pdf`, and a malformed encryption dictionary is refused where `sanitize` threw.
- A CCITT image counts toward the 64 MiB bound for the `/Columns` and `/Rows` of its `/DecodeParms` where they are more than its own width and height. A JPEG 2000 image that leaves out its color space or its bits is not `damaged`: it counts at four components or eight bits.
- A page whose `/UserUnit` is a positive number other than 1 is refused as `damaged`. It passed the 14,400 pt bound, and its background was not the size `form.pages` says. No background keeps the key.
- A dynamic form with an ellipse is redrawn with it. It was `unpaintable` with `construct: 'svg'`. A stroked rectangle of no width or no height is no longer redrawn as a bar.
- A character of Symbol or ZapfDingbats in a dynamic form's text (the triangles, mu, the arrows) is drawn, and U+2010 as a hyphen. The form was `unpaintable` with `construct: 'glyph'`, as one with a character no standard font holds still is.
- A dynamic form with a field wholly off its page is refused as `layout`, with `detail: 'a field is off its page'`. It converted with that field out of reach.
- A dynamic form's page is redrawn in the order the browser paints it: a border shows whole over its own fill, and a fill hides what lies under it. No field moves.
- An image counts toward the 64 MiB bound for the bytes its dictionary declares, so a file whose images declare more is `too_large`. An image whose dictionary does not say is `damaged`.
- A page over 14,400 pt on a side, or with a box that far from the origin, is refused as `damaged`. No published form measured has one.
- `limits` is exported: `{ bytes, pages, fields }`, the largest file, the most pages and the most fields `sanitize` takes.
- A file whose catalog or page tree cannot be read as one, or whose background would keep an object that says it is an annotation or a page outside the page tree, is refused as `damaged`. The background step threw, or returned a background without that object, the catalog included.

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
