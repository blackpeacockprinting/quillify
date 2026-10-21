# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- A naming may tick a checkbox or a radio option in the example: an `example` of `true` reaches `example.md` as a YAML `true`, and the engine's render of the example shows the box ticked. A box with no example, or with any other, stays out of `example.md` as before.
- Kept fields that take the same value may share a name, and the quill asks for it once and fills each of them. `check` reports `duplicate_name` only for fields of different values, or for signatures or radio buttons.
- A quill's field spec is `Form.yaml`, and its `Quill.yaml` declares `requires: ">=0.127"`, as `@quillmark/wasm` 0.127 reads it: that release refuses a `form.yaml`, and no acroform quill opens on both 0.126 and 0.127. The peer is `@quillmark/wasm` 0.127.0 or later. A host moves both together, and rebuilds a quill it stored from an earlier release, or renames its `form.yaml` to `Form.yaml` and adds the `requires` line.

## v0.7.0 - 2026-10-19

- A dynamic form's Calibri is laid out in Carlito, a face of its widths the package ships, so its labels break where the form's designer broke them on any machine. A form that names Calibri fetches only the styles it uses, and a host that copies `assets/` by hand copies the four `Carlito-*.ttf` too: one that does not load ends the conversion with an error that names it.
- A dynamic form's Times New Roman and Courier New are laid out in Liberation Serif and Mono, faces of their widths the package ships, so they lay out alike on any machine. A host that copies `assets/` by hand copies their eight files too.
- A dynamic form's text is broken into lines where it is wider than its box at the size the browser draws it, so a label that fits no longer grows its box and drops onto the field under it.
