# Changelog

What a consumer of the package can observe, by release.

## Unreleased

- `sanitize(pdf)` reads a PDF form into a `Form`: a background with no form layer, the page sizes and one `Field` for each field a person can fill. A file it does not take comes back as a `Refusal`, a code with its data.
- `suggest(fields)` names each field from its tooltip or its field name, and `check(fields, naming)` lists the problems of a naming.
- `quillify(form, naming)` returns a quill's files, `Quill.yaml`, `form.json` and `form.pdf`, once `Quill.fromTree` has taken them, or the problems that stopped it.
- `@quillmark/wasm` is a peer dependency, at 0.124.0 or later.
- Each pdf.js read runs on a worker of its own, started from the worker the package ships. pdf.js's global worker settings are neither read nor written.
