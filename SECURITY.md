# Security

## Reporting

Report a vulnerability through GitHub's private vulnerability reporting: the repository's Security tab, "Report a vulnerability". Do not open a public issue for one, and attach no form a person filled in.

## The boundary

The bytes of a PDF nobody vouches for go in. A quill comes out, and other people load it and fill it.

`sanitize` is the only function that reads the file: it returns a `Form` (the fields and a background PDF) or the reason the file is not taken. `quillify` builds the quill from that `Form` and a naming. The library has no interface and stores nothing.

## A form's strings are the file's

Treat every string in a `Form` that is not a `kind` as written by the PDF's author: a field's `id` and `tooltip`, a choice's `options`, a radio's `group` and `on`. The same holds for a refusal's `attachment` and `detail`, a `description` that `suggest` builds, and whatever the engine's `message` quotes in a `Problem`. Show each as text.

## What `sanitize` holds

- It requests the package's own files and nothing else.
- qpdf runs as WebAssembly in a worker of its own for each file, and each pdf.js read in a worker of its own. A call that has settled leaves no worker, no frame and no listener.
- qpdf decrypts the file and writes every stream it can decode back as one Flate stream, with no object stream. A stream it leaves under any other filter than an image codec gets the file refused as `damaged`.
- The background keeps, of each dictionary, the keys that the table `KINDS` in `src/strip.ts` lists for its kind, and no object the walk from the catalog does not reach. No row keeps a value whole.
- Gone with the rest of the catalog: the form layer (`/AcroForm`, its XFA packet), scripts, attachments, XMP metadata, bookmarks, named destinations and the usage-rights signature. So are the trailer's `/Info` and `/ID`.
- Of a page's annotations only a link stays, and only one that leads one way: to an `http://` or `https://` address or to an explicit destination in the file. Every widget and every other annotation is deleted.
- A file in which two keys reach one object as two kinds, or whose pages pdf.js and pdf-lib read as different objects, is refused as `damaged`.
- A dynamic (XFA) form is laid out in a hidden `<iframe>` with `sandbox="allow-same-origin"` and the policy `default-src 'none'; img-src blob: data:`. It runs no script, and no style crosses between it and the host page.
- A dynamic form's background is a redraw of that layout. A form with something the redraw cannot draw is refused as `unpaintable`.
- `quillify` writes each string it puts in `Quill.yaml` and `example.md` as an escaped JSON string literal.

[`prose/DECISIONS.md`](prose/DECISIONS.md) has the reason and the measurements behind each rule.

## Bounds

| Bound                                                                        | Value     | Refusal                              |
| ---------------------------------------------------------------------------- | --------- | ------------------------------------ |
| `MAX_BYTES`: the file handed in                                              | 8 MiB     | `too_large`                          |
| `MAX_INFLATED_BYTES`: what qpdf writes plus what its Flate streams decode to | 64 MiB    | `too_large`                          |
| `MAX_PAGES`                                                                  | 25        | `too_many_pages`                     |
| `MAX_WIDGETS`: fields                                                        | 1,000     | `too_many_fields`                    |
| `MAX_PICTURE_PIXELS`: a dynamic form's pictures, each use counted            | 8,000,000 | `unpaintable`, with `detail: pixels` |
| `MAX_SECONDS`: a wait on a worker                                            | 60 s      | `too_slow`                           |

## Not handled

- A filled copy flattened in part holds a person's entries as page content, which nothing here tells from print. A person looks at the pages before a quill is shared.
- The tags keep their strings (`/Alt`, `/ActualText`, `/E`, `/T`, `/ID`, `/Lang`), which no page shows. The fields of a form filled from a quill are untagged (#192).
- Content in a layer that is off on screen or in print stays in the background (#32).
- A dictionary by name (a map of a `/Resources`, a `/RoleMap`, a `/ClassMap`) keeps any number, name or string a file writes under a name of its own. No reader presents one as a field.
- qpdf's memory before a file is refused is not bounded: it reads an object stream whole, in its worker (#46).
- An image under a codec counts as stored, whatever width and height it declares (#163).
- For a file qpdf writes nothing for, pdf.js opens the original to say why, and what it inflates is not counted (#164).
- `qpdf.wasm` is a prebuilt binary from one publisher. A file of about 1 kB, of deeply nested arrays, traps it (`damaged`) or hangs it until the deadline (`too_slow`). In chrome-headless-shell on Linux a trap ends the browser (#46).
- A link to an address with no scheme, or to a `mailto:` address, is removed (#68).
- The deadline ends a wait on a worker and nothing on the calling thread, so a call can settle after 60 s. Until then a file can keep a worker, and a core, busy.
- No cap holds a dynamic form's background to the size of its file: at the pixel bound it can come to 32 MB.

## Supply chain

- Two runtime dependencies, `pdf-lib` and `pdfjs-dist`, each pinned exactly. The engine, `@quillmark/wasm`, is a peer the consumer installs and serves.
- The package redistributes eight files of other projects. `NOTICE` names each, its version and what was changed in it.
- The build holds `qpdf.wasm` and the four font files to recorded SHA-256 hashes, and a test holds the pdf.js worker to the installed one but for the changes `NOTICE` lists.
- An install in the repository runs no lifecycle script (`.npmrc`). CI runs `npm ci` with read-only permissions, on actions pinned by commit.
- A release is published from CI by trusted publishing with provenance, and its GitHub release carries the tarball, an SBOM and `SHA256SUMS`.
