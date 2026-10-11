# Security

## The boundary

The bytes of a PDF nobody vouches for go in. A quill comes out, and other people fill it and pass it around. `sanitize` is the only function that reads the file: it returns a `Form`, which is the fields and a background PDF, or the reason the file is not taken. `quillify` builds the quill from that `Form` and a naming. The library has no interface and stores nothing.

`sanitize` requests the package's own files and nothing else, which a test holds on a dynamic form. `quillify` has the engine load its own binary, which is the peer's file and the consumer's to serve.

## A form's strings are the file's

Every string in a `Form` that is not a `kind` is text the author of the PDF controls: a field's `id`, its `tooltip`, a choice's `options`, a radio's `group` and `on`. So are the `attachment` and `detail` of a `Refusal`, the `description` that `suggest` builds from a tooltip and an on-state, and whatever the engine's `message` quotes in a `Problem`. A consumer shows each in a UI as text. `quillify` writes each string it puts in `Quill.yaml` and `example.md` as a JSON string literal, after a lone surrogate has become U+FFFD, and writes U+007F to U+009F, U+FFFE and U+FFFF, which JSON leaves raw and the engine's YAML reader refuses (U+0085 apart), as `\u` escapes. A tooltip it puts in `form.json` has a lone surrogate made U+FFFD as well, since the engine's JSON reader refuses the escape JSON writes for one.

## What the background keeps

`stripAcroForm` writes the background from the file's pages. It keeps a named set of keys and deletes every other:

- of the catalog: `Type Pages OCProperties StructTreeRoot MarkInfo Lang`. With the rest go the form (`/AcroForm` and its XFA packet, `/NeedsRendering`), the XMP metadata, scripts, attachments, a portfolio, bookmarks, named destinations and the usage-rights signature. The trailer's `/Info` and `/ID` go too.
- of a page tree node: `Type Parent Kids Count Resources Rotate`.
- of a page: `Type Parent Resources MediaBox Contents Rotate Group UserUnit StructParents Tabs`. The MediaBox is written from pdf.js's view of the page, the frame its fields were measured in, and no box of the file is carried over.
- of a link: `Type Subtype Rect Border BS C H QuadPoints F OC Contents StructParent A Dest`.
- of a link's action: `S URI`, or `S D`.

Of a page's annotations only a link stays, and only one that leads one way: by an `/A` or by a `/Dest`, never both, with nothing chained by `/Next`. That way is a `/URI` that begins `http://` or `https://` in either case, a `/GoTo` to an explicit destination, or an explicit `/Dest`. The action it keeps is a copy. Every other object that says `/Type /Annot`, has a `/Rect` or is a widget is deleted, as is a page object the page tree does not hold, and then every object the catalog no longer reaches. A file whose pages pdf-lib reads as other objects than pdf.js did, or as more or fewer, is refused as `damaged`, so the page under a field is the page pdf.js found the field on.

What a kept value holds is not read: a `/Resources` dictionary, a `/Border` array or a destination array can reference anything.

## What it cannot see

The background is the file's pages, so whatever a page shows goes into every quill built from it. The library is for a blank form as published. Handed a copy that a person filled in, it takes the entries out with the form layer, and only there. A copy flattened in full has no field left and is refused as `no_fields`. One flattened in part holds those entries as page content, which nothing here can tell from printed text. A field that holds a value is no sign of one: seven of the 59 measured forms have such a field as published. The check is the consumer's: a person looks at the pages before a quill is shared.

A layer is kept as the file has it (`/OCProperties`, with each group's default state). Content in a layer that is off on screen or in print stays in the background, and a reader that ignores optional content shows it. Of 1,413 published files, 31 have layers, and 13 of those hide content in one state a reader starts in, 12 for print and one for the screen. None hides content in every state. A dynamic form's background is the redraw, which has no layer. A person who looks at the pages on a screen does not see content a layer hides there (#32).

## Where a file is read

Each pdf.js read runs on a worker of its own, started from the file the package ships and ended with the read. qpdf runs as WebAssembly in a worker of its own for each file, started from a second file the package ships and ended when `normalizePdf` has its answer, whatever qpdf did: no module, heap or virtual file of one file is there for the next, and a file that traps qpdf is refused as `damaged` and costs the next file nothing. The worker fetches `qpdf.wasm` from the URL the page gives it. pdf-lib reads what qpdf wrote, on the calling thread, or for a dynamic form the redraw this library painted from the layout.

pdf.js lays an XFA form out in a DOM so its fields get positions. That DOM is built in an `<iframe>` with a document of its own. `sanitize` makes the frame for every file that reaches the conversion, dynamic or not, because pdf.js binds a form's fonts as it opens the file. The frame is hidden and has no size. It is in the host page's body until that stage ends.

The frame has `sandbox="allow-same-origin"`, so it runs no script, and its document carries the policy `default-src 'none'; img-src blob: data:`. That policy lets a form's images in: pdf.js hands the frame each image on a dynamic form's page as a `blob:` URL, the browser loads it there, and the page is then refused as `unpaintable`. The stylesheet the layout needs is adopted on that document, and the conversion ends with an error if it does not apply. No rule of the host page applies inside the frame's document, and the form's rules and fonts do not reach the host.

The policy governs what the frame's document loads, and it names no font source. A form's font face is not the document's to load: pdf.js makes each face in the host page's realm, from the file's bytes or a `local()` name, and adds it to the frame's font set. The library never gives pdf.js a URL to fetch a font from.

The host page still reaches the frame element. A rule that hides it, or a script that takes it out of the document once it has loaded, ends the conversion with an error that says the host page hid or removed the frame. A frame taken out before it has loaded ends the conversion with an error that says so, before a worker starts: until the frame loads, a `MutationObserver` on the host document watches for it leaving. A `zoom` on the frame or an ancestor scales the layout inside it. The frame sets a zoom of its own that undoes its ancestors', read from `Element.currentCSSZoom`, and before a page is measured the conversion ends with an error that names the host page's zoom unless the zoom in effect on the frame is exactly 1. A browser that has `zoom` and no `currentCSSZoom` gets neither, and a zoom there scales the layout with nothing to report it.

## Not handled

- #25 The background keeps whatever strip does not name. This holds for the trailer and for what a kept value holds, as above.
- #30 The size cap bounds the compressed input only. qpdf copies a page's Flate content as stored and still inflates each object stream of the file, whatever it decodes to.
- #46 qpdf.wasm is a prebuilt binary from one publisher. A page whose `/Group` is arrays nested about 180 to 499 deep, a file of about 1 kB, breaks it. At some depths qpdf traps, and the file is refused as `damaged`. At others it never returns. Which it is depends on the depth and on where qpdf runs, and in chrome-headless-shell on Linux a trap ends the whole browser.
- #68 A link to an address with no scheme, or to a mailto: address, is removed.
- #86 sanitize has no deadline. A file that pdf.js never finishes laying out leaves it pending, with its frame in the host page's body. The one kind of template known to do that, an overflow leader before a row that cannot fit, is guarded in the worker the package ships. Until there is a deadline, nothing but the size cap bounds how long a dynamic form takes: pdf.js lays out every page in its worker to count the pages, and one page can hold any number of fields. A field tree 20,000 deep, a file of 1.9 MB, keeps sanitize 99 s. qpdf has no deadline either: a file it never finishes leaves sanitize pending for that file, with its worker busy until the page goes, and other files convert meanwhile. One such file is known (#46).
