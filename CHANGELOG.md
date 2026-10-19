# Changelog

What a consumer can observe, in the latest release and since. Earlier releases are on the [releases page](https://github.com/tonguetoquill/quillify/releases).

## Unreleased

## v0.6.0 - 2026-10-19

- A text field of a dynamic form keeps the character limit its template sets as `maxChars`, as its `maxLength`, as a static form's `/MaxLen` already did.
- A text field's character limit is written to `Quill.yaml` as `max:`, which engine 0.126.2 is the first to read. A field of lines gets none. To move, take `@quillmark/wasm` 0.126.2.
