# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- A quill is written for engine 0.126 and loads on no earlier engine, and its tree holds `form.yaml` where it held `form.json`. To move, take `@quillmark/wasm` 0.126 with quillify 0.5.

## v0.4.0 - 2026-10-16

- A naming may give a field a `title`, the label an editor shows in place of its name. `suggest` gives none, since its description is already the field's tooltip.
- A radio group's options are plain checkboxes, with no frame, in the naming's order. Engine 0.125 warned `quill::deprecated_groups` on the `ui.group` and `ui.groups` keys that framed them, and settled the options after every other field.
- A line a dynamic form breaks at a soft hyphen is redrawn with the hyphen the layout shows at its end, and the next line starts with its own first letter.
