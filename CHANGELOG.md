# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- A field a dynamic form puts on a dark fill is redrawn on a white box, where the value the engine writes in black can be read.
- A naming may give a field a `title`, the label an editor shows in place of its name. `suggest` gives none, since its description is already the field's tooltip.
- A radio group's options are plain checkboxes, with no frame, in the naming's order. Engine 0.125 warned `quill::deprecated_groups` on the `ui.group` and `ui.groups` keys that framed them, and settled the options after every other field.
- A line a dynamic form breaks at a soft hyphen is redrawn with the hyphen the layout shows at its end, and the next line starts with its own first letter.

## v0.3.1 - 2026-10-12

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
