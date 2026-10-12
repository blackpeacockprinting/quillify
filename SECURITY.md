# Security

## Reporting

Report a vulnerability privately: the repository's Security tab, "Report a vulnerability". No public issue, and no filled-in form attached.

Fixes go into the latest release.

## The boundary

Untrusted PDF bytes go in, and a quill comes out that other people load and fill. Every string in a `Form`, a refusal or a `Problem` is the file author's text: show it as text.

## What `sanitize` holds

A way past any of these is a vulnerability.

- Each file gets workers of its own.
- It requests only the package's own files.
- The background keeps only allowlisted keys per kind of dictionary (`KINDS`, `src/strip.ts`) and objects the catalog reaches.
- The form layer, scripts, attachments, metadata and bookmarks are gone.
- Only links to `http://`, `https://` or a destination in the file stay.
- A dynamic (XFA) form is laid out in a sandboxed `<iframe>` that runs no script.
- A file that reads two ways is refused as `damaged`.
- `quillify` writes every string into the quill's files as an escaped JSON string literal.

Reasons: [the decision log and research notes written before v0.3.0](https://github.com/tonguetoquill/quillify/tree/84619f7/prose).

## Bounds

- `MAX_BYTES`: 8 MiB, `too_large`
- `MAX_INFLATED_BYTES` (qpdf's output, decoded streams and what each image declares): 64 MiB, `too_large`
- `MAX_PAGES`: 25, `too_many_pages`
- `MAX_WIDGETS` (fields): 1,000, `too_many_fields`
- `MAX_SIDE` (a page's side, and its box's reach from the origin): 14,400 pt, `damaged`
- `MAX_PICTURE_PIXELS` (a dynamic form's pictures): 8,000,000, `unpaintable`
- `MAX_SECONDS` (a worker wait): 60 s, `too_slow`

## Not handled

Known, and no vulnerability to report: each is an open limit.

- Entries flattened into page content read as print: check the pages before sharing a quill.
- Tag strings no page shows (`/Alt`, `/ActualText`, `/E`, `/T`, `/ID`, `/Lang`) stay, and filled fields are untagged (#192).
- Content in a layer that is off stays (#32).
- A dictionary by name (`/Resources` maps, `/RoleMap`, `/ClassMap`) keeps values under names the file chose.
- qpdf's memory before a refusal is unbounded (#46).
- An image counts for what its dictionary declares. A codec's own header is not read, and an image inside a content stream is not counted.
- When qpdf writes nothing, pdf.js opens the original, outside the 64 MiB bound, and inflates whole an object stream that holds the catalog: 512 MiB from a file of 0.5 MB held 1.5 GiB for 4.4 s. The memory goes with the worker (#164).
- `qpdf.wasm` is one publisher's prebuilt binary. A 1 kB file traps or hangs it, and a trap ends chrome-headless-shell on Linux (#46).
- A link with no scheme, or to `mailto:`, is removed (#68).
- The deadline ends only a wait on a worker: a call can settle after 60 s.
- A dynamic form's background is not capped by file size: up to 32 MB.

## Supply chain

- `pdf-lib` and `pdfjs-dist` are pinned exactly. The engine, `@quillmark/wasm`, is a peer.
- `NOTICE` names the eight redistributed files. The build holds `qpdf.wasm` and the fonts to SHA-256 hashes.
- Installs run no lifecycle script. CI publishes with provenance, an SBOM and `SHA256SUMS`.
