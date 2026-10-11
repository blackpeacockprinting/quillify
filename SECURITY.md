# Security

## The boundary

The bytes of a PDF nobody vouches for go in. A quill comes out, and other people fill it and pass it around. `sanitize` is the only function that reads the file: it returns a `Form`, which is the fields and a background PDF, or the reason the file is not taken. `quillify` builds the quill from that `Form` and a naming. The library has no interface and stores nothing.

`sanitize` requests the package's own files and nothing else, which a test holds on a dynamic form. `quillify` has the engine load its own binary, which is the peer's file and the consumer's to serve.

## A form's strings are the file's

Every string in a `Form` that is not a `kind` is text the author of the PDF controls: a field's `id`, its `tooltip`, a choice's `options`, a radio's `group` and `on`. So are the `attachment` and `detail` of a `Refusal`, the `description` that `suggest` copies from a tooltip, and whatever the engine's `message` quotes in a `Problem`. A consumer shows each in a UI as text.

## What the background keeps

`stripAcroForm` writes the background from the file's pages. It keeps a named set of keys and deletes every other:

- of the catalog: `Type Pages OCProperties StructTreeRoot MarkInfo Lang`. With the rest go the form (`/AcroForm` and its XFA packet, `/NeedsRendering`), the XMP metadata, scripts, attachments, a portfolio, bookmarks, named destinations and the usage-rights signature. The trailer's `/Info` goes too.
- of a page tree node: `Type Parent Kids Count Resources Rotate`.
- of a page: `Type Parent Resources MediaBox Contents Rotate Group UserUnit StructParents Tabs`. The crop box becomes the MediaBox.
- of a link: `Type Subtype Rect Border BS C H QuadPoints F OC Contents StructParent A Dest`.
- of a link's action: `S URI`, or `S D`.

Of a page's annotations only a link stays, and only one that leads one way: by an `/A` or by a `/Dest`, never both, with nothing chained by `/Next`. That way is a `/URI` that begins `http://` or `https://` in either case, a `/GoTo` to an explicit destination, or an explicit `/Dest`. The action it keeps is a copy. Every other object that says `/Type /Annot`, has a `/Rect` or is a widget is deleted, as is a page object the page tree does not hold, and then every object the catalog no longer reaches.

What a kept value holds is not read: a `/Resources` dictionary, a `/Border` array or a destination array can reference anything.

## Where a file is read

Each pdf.js read runs on a worker of its own, started from the file the package ships and ended with the read. qpdf runs as WebAssembly on the calling thread. pdf-lib reads what qpdf wrote, or for a dynamic form the redraw this library painted from the layout.

pdf.js lays an XFA form out in a DOM so its fields get positions. That DOM is built in an `<iframe>` with a document of its own. `sanitize` makes the frame for every file that reaches the conversion, dynamic or not, because pdf.js binds a form's fonts as it opens the file. The frame is hidden and has no size. It is in the host page's body until that stage ends.

The frame has `sandbox="allow-same-origin"`, so it runs no script, and its document carries the policy `default-src 'none'; img-src blob: data:`. That policy lets a form's images in: pdf.js hands the frame each image on a dynamic form's page as a `blob:` URL, the browser loads it there, and the page is then refused as `unpaintable`. The stylesheet the layout needs is adopted on that document, and the conversion ends with an error if it does not apply. No rule of the host page applies inside the frame's document, and the form's rules and fonts do not reach the host.

The policy governs what the frame's document loads, and it names no font source. A form's font face is not the document's to load: pdf.js makes each face in the host page's realm, from the file's bytes or a `local()` name, and adds it to the frame's font set. The library never gives pdf.js a URL to fetch a font from.

The host page still reaches the frame element. A rule that hides it, or a script that takes it out of the document once it has loaded, ends the conversion with an error that says the host page hid or removed the frame. A `zoom` on the frame or an ancestor scales the layout, and nothing reports it (#95). A frame removed before it has loaded leaves `sanitize` pending (#99).

## Not handled

- #25 The background keeps whatever strip does not name. This holds for the trailer and for what a kept value holds, as above.
- #28 A CropBox larger than the MediaBox moves every field off its box.
- #29 A dynamic form is laid out in full before its page and field caps are read.
- #30 The size cap bounds the compressed input only.
- #31 SF 182's background declares more objects than it holds.
- #46 qpdf.wasm is a prebuilt binary from one publisher.
- #68 A link to an address with no scheme, or to a mailto: address, is removed.
- #69 A page that names its /Type by reference is cut from the background without a refusal.
- #77 A tooltip of 130,000 characters ends sanitize with a RangeError.
- #80 A field tree pdf-lib cannot walk ends sanitize with pdf-lib's error.
- #84 A dynamic form with a field named as the subform beside it ends sanitize with an error.
- #85 pdf.js fails on three dynamic forms with a TypeError the guard does not cover.
- #86 pdf.js never finishes opening DAF 1024, and sanitize never settles. Its frame stays in the host page's body.
- #89 A control character from the file is written raw into Quill.yaml.
- #95 A host page's zoom moves a dynamic form's fields with no error.
- #99 A frame the host page removes before it loads leaves sanitize pending.
