# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

- A text field of a dynamic form keeps the character limit its template sets as `maxChars`, as its `maxLength`, as a static form's `/MaxLen` already did.
- A text field's `maxLength` is written to `form.yaml` as `max_length` on each of its bindings, a field of lines carrying it for the whole field. Engine 0.126 ignores it and enforces no limit.

## v0.5.0 - 2026-10-17

- A quill is written for engine 0.126 and loads on no earlier engine, and its tree holds `form.yaml` where it held `form.json`. To move, take `@quillmark/wasm` 0.126 with quillify 0.5.
- A field a dynamic form puts on a dark fill is redrawn on a white box, where the value the engine writes in black can be read.
