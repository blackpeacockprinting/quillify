# Changelog

What a consumer of the package can observe, by release.

## Unreleased

- `sanitize(pdf)` reads a PDF form into a `Form`: a background with no form layer, the page sizes and one `Field` for each field a person can fill. A file it does not take comes back as a `Refusal`, a code with its data.
- `suggest(fields)` names each field from its tooltip or its field name, and `check(fields, naming)` lists the problems of a naming. A naming of the wrong shape, a name that is no string for one, ends `check` and `quillify` with a `TypeError` that names the slot.
- `quillify(form, naming)` returns a quill's files, `Quill.yaml`, `form.json`, `form.pdf` and, when a kept field has an example to show, `example.md`, once `Quill.fromTree` has taken them, or the problems that stopped it.
- `@quillmark/wasm` is a peer dependency, at 0.124.0 or later.
- Each pdf.js read runs on a worker of its own, started from the worker the package ships. pdf.js's global worker settings are neither read nor written.
- The package carries its pdf.js worker (6.3.289 with a null guard at two sites), `qpdf.wasm` and its stage stylesheet in `assets/`, and loads them from there.
- A dynamic form is laid out in a sandboxed frame with a document of its own. No rule of the host page applies inside it, and the form's rules and fonts do not reach the host. The frame is hidden and has no size. It is in the host page's body while `sanitize` converts a file, dynamic or not, and is removed when that stage ends.
- The package has one entry point, built to `dist/`. `npm run build && npm pack` makes a tarball of the build, the three assets, `NOTICE` and pdf.js's license text.
