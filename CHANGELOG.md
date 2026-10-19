# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- A dynamic form's Calibri is laid out in Carlito, a face of its widths the package ships, so its labels break where the form's designer broke them on any machine. A form that names Calibri fetches only the styles it uses, and a host that copies `assets/` by hand copies the four `Carlito-*.ttf` too: one that does not load ends the conversion with an error that names it.
- A dynamic form's Times New Roman and Courier New are laid out in Liberation Serif and Mono, faces of their widths the package ships, so they lay out alike on any machine. A host that copies `assets/` by hand copies their eight files too.
- A dynamic form's text is broken into lines where it is wider than its box at the size the browser draws it, so a label that fits no longer grows its box and drops onto the field under it.

## v0.6.0 - 2026-10-19

- A text field of a dynamic form keeps the character limit its template sets as `maxChars`, as its `maxLength`, as a static form's `/MaxLen` already did.
- A text field's character limit is written to `Quill.yaml` as `max:`, which engine 0.126.2 is the first to read. A field of lines gets none. To move, take `@quillmark/wasm` 0.126.2.
