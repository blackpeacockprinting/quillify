# Changelog

What a consumer of the package can observe, by release.

## Unreleased

- A background passes `qpdf --check` with no warning: its trailer's `/Size` is one more than its highest object number. SF 182's said 1,739 where the highest was 1,679, and the backgrounds of the three dynamic forms and of the sample were off the same way.

## 0.1.0

11 October 2026. The importer of `tonguetoquill/web-app-afa-demo@842ef4207cb5` as a library, on `@quillmark/wasm` 0.124.0.

- `sanitize(pdf)` reads a PDF form into a `Form`: a background with no form layer, the page sizes and one `Field` for each field a person can fill. A file it does not take comes back as a `Refusal`, a code with its data.
- Checkboxes that share a field name and turn on as different values come back from `sanitize` as one `radio` field for each box, with the shared name as `group` and the box's value as `on`. The first keeps the name as its `id` and the next is `name#2`. Checkboxes of one name that all turn on as one value stay one `checkbox` at several places.
- `suggest(fields)` names each field from its tooltip or its field name, and `check(fields, naming)` lists the problems of a naming. A naming of the wrong shape, a name that is no string for one, ends `check` and `quillify` with a `TypeError` that names the slot.
- `quillify(form, naming)` returns a quill's files, `Quill.yaml`, `form.json`, `form.pdf` and, when a kept field has an example to show, `example.md`, once `Quill.fromTree` has taken them, or the problems that stopped it.
- `@quillmark/wasm` is a peer dependency, at 0.124.0 or later.
- Each pdf.js read runs on a worker of its own, started from the worker the package ships. pdf.js's global worker settings are neither read nor written.
- The package carries its pdf.js worker (6.3.289 with a null guard at two sites), `qpdf.wasm` and its stage stylesheet in `assets/`, and loads them from there.
- A dynamic form is laid out in a sandboxed frame with a document of its own. No rule of the host page applies inside it, and the form's rules and fonts do not reach the host. The frame is hidden and has no size. It is in the host page's body while `sanitize` converts a file, dynamic or not, and is removed when that stage ends.
- The package has one entry point, built to `dist/`. `npm run build && npm pack` makes a tarball of the build, the three assets, `NOTICE` and pdf.js's license text.
