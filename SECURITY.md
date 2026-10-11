# Security

## The boundary

The bytes of a PDF nobody vouches for go in. A quill comes out, and other people fill it and pass it around. `sanitize` is the only function that reads the file: it returns a `Form`, which is the fields and a background PDF, or the reason the file is not taken. `quillify` builds the quill from that `Form` and a naming. The library has no interface and stores nothing.

`sanitize` requests the package's own files and nothing else, which a test holds on a dynamic form. `quillify` has the engine load its own binary, which is the peer's file and the consumer's to serve.

## A form's strings are the file's

Every string in a `Form` that is not a `kind` is text the author of the PDF controls: a field's `id`, its `tooltip`, a choice's `options`, a radio's `group` and `on`. So are the `attachment` and `detail` of a `Refusal`, the `description` that `suggest` builds from a tooltip and an on-state, and whatever the engine's `message` quotes in a `Problem`. A consumer shows each in a UI as text. `quillify` writes each string it puts in `Quill.yaml` and `example.md` as a JSON string literal, after a lone surrogate has become U+FFFD, and writes U+007F to U+009F, U+FFFE and U+FFFF, which JSON leaves raw and the engine's YAML reader refuses (U+0085 apart), as `\u` escapes. A tooltip it puts in `form.json` has a lone surrogate made U+FFFD as well, since the engine's JSON reader refuses the escape JSON writes for one.

## What the background keeps

`stripAcroForm` writes the background from the file's pages. One table in `strip.ts`, `KINDS`, lists the keys each kind of dictionary keeps and what each key leads to. A walk from the catalog gives each object one kind, the first that reaches it, and deletes every key its kind does not list, every value that is not what its key leads to, and every object it does not reach. It keeps:

- of the catalog: `Type Pages OCProperties StructTreeRoot MarkInfo Lang`. With the rest go the form (`/AcroForm` and its XFA packet, `/NeedsRendering`), the XMP metadata, scripts, attachments, a portfolio, bookmarks, named destinations and the usage-rights signature. The trailer's `/Info` and `/ID` go too.
- of a page tree node: `Type Parent Kids Count Resources Rotate`.
- of a page: `Type Parent Resources MediaBox Contents Rotate Group UserUnit StructParents Tabs Annots`. The MediaBox is written from pdf.js's view of the page, the frame its fields were measured in, and no box of the file is carried over.
- of a link: `Type Subtype Rect Border BS C H QuadPoints F OC Contents StructParent A Dest`.
- of a link's action: `S URI`, or `S D`.
- of a `/Resources`: `Font XObject ExtGState ColorSpace Pattern Shading Properties ProcSet`. A stream or a dictionary under its `/XObject` stays only when it is an image or a form.
- of an image: `Type Subtype Width Height BitsPerComponent ColorSpace Decode ImageMask Mask SMask SMaskInData Matte Interpolate Intent OC StructParent`.
- of a form: `Type Subtype FormType BBox Matrix Resources Group OC StructParent StructParents`. An application's private data under `/PieceInfo` goes, with the date beside it.
- of the dictionary of a stream of any kind `STREAMS` names (a content stream, an image, a form and the global segments of a JBIG2 image), beside the keys of its kind: `Length Filter DecodeParms`. A stream that names a file outside (`/F`, `/FFilter`, `/FDecodeParms`) keeps none of the three.
- of a `/DecodeParms`: `Predictor Colors BitsPerComponent Columns EarlyChange K EndOfLine EncodedByteAlign Rows EndOfBlock BlackIs1 DamagedRowsBeforeError ColorTransform JBIG2Globals`.

A number, a name, a string, a boolean, null or an array of those, read through any reference and never an array that holds itself, stays under any listed key, where a kind is expected too: a string written as an entry of `/XObject` or as a page's `/Contents` stays as written. A key that leads to no kind keeps nothing else. A key that leads to one of a kind or an array of them keeps no array inside that array. A `/Parent` stays when it names a page tree node the walk reached. An object that two keys reach as two kinds keeps the first, and the second key is deleted.

Of a page's annotations only a link stays, and only one that leads one way: by an `/A` or by a `/Dest`, never both, with nothing chained by `/Next`. That way is a `/URI` that begins `http://` or `https://` in either case, a `/GoTo` to an explicit destination, or an explicit `/Dest`. The action it keeps is a copy. Every other object that says `/Type /Annot`, has a `/Rect` or is a widget is deleted, as is a page object the page tree does not hold. A file whose pages pdf-lib reads as other objects than pdf.js did, or as more or fewer, is refused as `damaged`. So is a file whose page another key reaches before the page tree does, or whose page sits under a page tree node or a `/Kids` array that another key reaches first: an object has one kind, and that page would be none. The page under a field is then the page pdf.js found the field on.

Some values are still kept whole, and what they hold is not read: a font, a graphics state, a color space, a pattern, a shading, a transparency group, a border, a destination, the layers, the property lists of marked content (the `/Properties` of a `/Resources`), the structure tree and the mark information can each reference anything (#25). An object one of them names stays as the file wrote it unless a row reaches it too.

## What it cannot see

The background is the file's pages, so whatever a page shows goes into every quill built from it. The library is for a blank form as published. Handed a copy that a person filled in, it takes the entries out with the form layer, and only there. A copy flattened in full has no field left and is refused as `no_fields`. One flattened in part holds those entries as page content, which nothing here can tell from printed text. A field that holds a value is no sign of one: seven of the 59 measured forms have such a field as published. The check is the consumer's: a person looks at the pages before a quill is shared.

A layer is kept as the file has it (`/OCProperties`, with each group's default state). Content in a layer that is off on screen or in print stays in the background, and a reader that ignores optional content shows it. Of 1,413 published files, 31 have layers, and 13 of those hide content in one state a reader starts in, 12 for print and one for the screen. None hides content in every state. A dynamic form's background is the redraw, which has no layer. A person who looks at the pages on a screen does not see content a layer hides there (#32).

## Where a file is read

Each pdf.js read runs on a worker of its own, started from the file the package ships and ended with the read. qpdf runs as WebAssembly in a worker of its own for each file, started from a second file the package ships and ended when `normalizePdf` has its answer, whatever qpdf did: no module, heap or virtual file of one file is there for the next, and a file that traps qpdf is refused as `damaged` and costs the next file nothing. The worker fetches `qpdf.wasm` from the URL the page gives it. qpdf writes every stream it can decode back as one Flate stream of its own, so the readers after it are not left to agree on a stream that ends badly.

qpdf is held to 64 MiB while it runs. Its worker counts what it writes and ends it at the write that passes the bound, since qpdf writes each of a file's streams whole, also the ones that lie inside one another: a file of 4.2 MB with 100 such images would come out as 420 MB. A memory that grew past the bound is a file past it too. What qpdf wrote is then counted before any other reader opens it, on the calling thread. pdf-lib lists its streams, and the browser's `DecompressionStream` inflates each Flate one, 1 KiB at a time and keeping nothing. The file's size and what those streams decode to may come to 64 MiB. Past any of the three the file is refused as `too_large`. A stream that cannot be counted gets the file refused as `damaged`: one the browser's decoder rejects, and one under a filter qpdf left on it, unless that is an image codec alone or after one Flate layer. So does a name that is `/ObjStm` or `/XRef` or begins with one, wherever it stands in what qpdf wrote and in any spelling pdf-lib reads as it. pdf-lib inflates a stream of either type whole as it parses, so the bytes are searched before it sees them.

pdf-lib then reads what qpdf wrote, on the calling thread, or for a dynamic form the redraw this library painted from the layout.

pdf.js lays an XFA form out in a DOM so its fields get positions. That DOM is built in an `<iframe>` with a document of its own. `sanitize` makes the frame for every file that reaches the conversion, dynamic or not, because pdf.js binds a form's fonts as it opens the file. The frame is hidden and has no size. It is in the host page's body until that stage ends.

The frame has `sandbox="allow-same-origin"`, so it runs no script, and its document carries the policy `default-src 'none'; img-src blob: data:`. That policy lets a form's images in: pdf.js hands the frame each image on a dynamic form's page as a `blob:` URL, the browser loads it there, and the page is then refused as `unpaintable`. The stylesheet the layout needs is adopted on that document, and the conversion ends with an error if it does not apply. No rule of the host page applies inside the frame's document, and the form's rules and fonts do not reach the host.

The policy governs what the frame's document loads, and it names no font source. A form's font face is not the document's to load: pdf.js makes each face in the host page's realm, from the file's bytes or a `local()` name, and adds it to the frame's font set. The library never gives pdf.js a URL to fetch a font from.

The host page still reaches the frame element. A rule that hides it, or a script that takes it out of the document once it has loaded, ends the conversion with an error that says the host page hid or removed the frame. A frame taken out before it has loaded ends the conversion with an error that says so, before a worker starts: until the frame loads, a `MutationObserver` on the host document watches for it leaving. A `zoom` on the frame or an ancestor scales the layout inside it. The frame sets a zoom of its own that undoes its ancestors', read from `Element.currentCSSZoom`, and before a page is measured the conversion ends with an error that names the host page's zoom unless the zoom in effect on the frame is exactly 1. A browser that has `zoom` and no `currentCSSZoom` gets neither, and a zoom there scales the layout with nothing to report it.

## Not handled

- #25 The background keeps some values whole, with whatever they reference: those listed above.
- The bound on what a file comes to leaves four things out.
  - qpdf's memory before the file is refused. qpdf reads an object stream whole, in its worker: a file of 1.04 MB whose object stream inflates to 1 GiB grows it to 1,075,445,760 bytes. The memory goes with the worker. A cap on it is a setting of qpdf's build (#46).
  - qpdf's time. It decodes a stream to write it back: about 4 s for a file of 1.04 MB whose page inflates to 1 GiB, and as long for one of 3,072 bytes that holds 1 GiB under two Flate filters. The page's thread is free meanwhile, and nothing ends qpdf early (#86).
  - An image's pixels (#163). An image under a codec counts as stored, whatever width and height it declares, in its dictionary or in its `/DecodeParms`.
  - A file qpdf writes nothing for (#164). pdf.js opens the original to say why, with XFA off, and what it inflates to find the catalog and the first page is not counted.
- #46 qpdf.wasm is a prebuilt binary from one publisher. A page whose `/Group` is arrays nested about 180 to 499 deep, a file of about 1 kB, breaks it. At some depths qpdf traps, and the file is refused as `damaged`. At others it never returns. Which it is depends on the depth and on where qpdf runs, and in chrome-headless-shell on Linux a trap ends the whole browser.
- #68 A link to an address with no scheme, or to a mailto: address, is removed.
- #86 sanitize has no deadline. A file that pdf.js never finishes laying out leaves it pending, with its frame in the host page's body. The one kind of template known to do that, an overflow leader before a row that cannot fit, is guarded in the worker the package ships. Until there is a deadline, nothing but the size cap bounds how long a dynamic form takes: pdf.js lays out every page in its worker to count the pages, and one page can hold any number of fields. A field tree 20,000 deep, a file of 1.9 MB, keeps sanitize 99 s. qpdf has no deadline either: a file it never finishes leaves sanitize pending for that file, with its worker busy until the page goes, and other files convert meanwhile. One such file is known (#46).
