# Taking a government PDF apart

What is actually inside the forms this app has to read, how to look, and the defects that looking found. Everything here was measured against a corpus of 24 published federal forms with `scripts/characterize-forms.mjs` and the commands below.

## Why this document exists

On 3 September 2026 the PDF import pipeline refused 22 of 24 real forms, and the two it took
came out blank. None of that was visible from the app: the refusals named a
format nobody had chosen, and the blank pages arrived with no error. Reading the
bytes was the only way to find out why.

## The tools, and what each one is for

Everything below is free and runs locally.

| Tool | What it answers |
| --- | --- |
| `qpdf --json` | The object graph as JSON: trailer, catalog, page tree, every dictionary. The first thing to run. |
| `qpdf --qdf --object-streams=disable` | Rewrites the file with uncompressed streams and one object per line, so `grep` and `xxd` work on it. |
| `qpdf --show-encryption` | Whether it is encrypted, at what revision, and which permission bits are set. |
| `qpdf --decrypt` | Strips a permissions wrapper. Works on an empty user password, which is what federal forms use. |
| `pdfinfo` / `pdftotext` / `pdftoppm` | Poppler's read of the same file. A second opinion that has no stake in your code. |
| `exiftool` | Producer, creator, XMP, and the timestamps that say which tool wrote it. |
| `binwalk` | Embedded file signatures. On a PDF, mostly confirms what the object graph already said. |
| `strings` / `xxd` | The last resort, and the fastest way to answer "is this token in here at all". |
| pypdf | Scripted structure walks: resolve `/Contents` arrays, decode streams, census operators. |
| pdf.js | The reference renderer for this app, and the only one whose behaviour matters to the browser. |

## What a real federal form is

Twenty-four forms: nine DD from `esd.whs.mil`, eight DAF from
`static.e-publishing.af.mil`, seven SF/OF from OPM and GSA.

| Class | Count | Signature in the bytes |
| --- | --- | --- |
| Hybrid XFA | 10 | `/AcroForm /XFA` present **and** `/Fields` holds real widgets with real `/Rect`s |
| Dynamic XFA | 10 | `/NeedsRendering true`, `/Fields` empty, one placeholder page |
| Plain AcroForm | 4 | No `/XFA` at all |

Seventeen of the twenty-four are wrapped: `/Encrypt` with an empty user password
and only permission bits set. `dd2875` is one of the seven that is not, so
`qpdf --show-encryption` reports "File is not encrypted" for it.

The producer is LiveCycle Designer across the DD and DAF forms, at four
generations rather than one: `Designer 6.4` on `dd0689` and `dd1750`,
`Designer 6.5` on most, `Designer 2024.07` on `daf1288` and `daf1297`. That
spread is not trivia. It decides which files can reach a pdf.js crash, and the
census below is the reason to check it before theorising.

### Telling the three apart

A dynamic form's whole first page is the "Please wait" notice. That is not a
metaphor:

```
$ pdftotext -f 1 -l 1 dd2875.pdf -
Please wait...
If this message is not eventually replaced by the proper contents of the document,
your PDF viewer may not be able to display this type of document.
```

A hybrid form's page carries the real printed form, and its `/Fields` array
carries widgets a non-XFA reader can use. This distinction decides everything:
the hybrid class is readable by any AcroForm tool, and the dynamic class is not
readable by anything that cannot run Adobe's layout engine.

pdf.js encodes the same rule. `xfaFactory` is only built when
`enableXfa && catalog.needsRendering && formInfo.hasXfa && !formInfo.hasAcroForm`,
so a hybrid never takes the XFA path and its widgets come back from
`getAnnotations()` like any other form's. Refusing on "XFA is present" therefore
refuses a class that already worked.

### Encryption, in practice

`qpdf --show-encryption` on the encrypted forms reports a standard security
handler with an empty user password. pdf.js decrypts these transparently and never
raises `PasswordException`, so an inventory step built on pdf.js accepts them.
pdf-lib cannot: there is no `RC4`, `AESV` or `decrypt` anywhere in its source.
`ignoreEncryption: true` does not help and is worse than failing, because it
suppresses one `throw` while `PDFWriter` re-emits `/Encrypt` on save, so
anything pdf-lib rewrites is written as plaintext into a file the reader will
try to decrypt.

The fix is to decrypt before pdf-lib ever sees the file. `qpdf --decrypt`, and
in the browser the same qpdf compiled to wasm.

## The `/Contents` array, and a renderer that ignored the spec

Two of five backgrounds rendered as blank pages through this app's
rendering backend while pdf.js and poppler painted all five. No error, no
diagnostic, no clue in the app.

A content-stream census found it. Resolve each page's `/Contents`, decode every
stream, count the operators:

```
DD1610: 8 stream(s), 15902 bytes, 1098 ops   ← blank
DD577:  8 stream(s), 14033 bytes,  848 ops   ← blank
DD689:  1 stream,     5091 bytes,  362 ops   ← painted
DD2977: 1 stream,    27053 bytes, 1268 ops   ← painted
```

A note on the fourth row, because two artifacts here carry the same form
number. `demo/samples/DD2977_Deliberate_Risk_Assessment_Worksheet.pdf` is an
Aspose-converted derivative: three pages, static, a full AcroForm. The published
file at `demo/samples/corpus/dd2977.pdf` is a different thing entirely: one
page, `Designer 6.5`, `/NeedsRendering true`, zero widgets, and its whole page
one is the "Please wait" notice. The census above measures the derivative,
because the published file has no form to render. Anywhere else in this
document, "DD 2977" means the published file.

Everything else about the four is the same. All carry `/TT0 /TT1 /TT2` as
non-embedded WinAnsi TrueType Arial with font descriptors, none has an
XObject, none has an optional-content group, all use `BDC`/`EMC` marked
content, and all use `FlateDecode`.

ISO 32000-1 §7.7.3.3 says a page's `/Contents` may be an array of streams and
that they are to be concatenated, with at least one whitespace between, and
treated as a single stream. The backend does not do that, and paints nothing
rather than painting the first element or raising an error.

The fix is one qpdf flag. `--coalesce-contents` merges the array into a single
stream, and after it all five backgrounds paint:

```
dd1610  ink 0.000 -> 0.110
dd0577  ink 0.000 -> 0.123
```

`src/lib/services/pdf-import/normalize.ts` carries the flag, and
`background.svelte.test.ts` renders all five through both renderers so a
regression fails a test rather than shipping a blank form.

**The lesson worth keeping**: when one renderer paints a file and another does
not, census the content streams before suspecting fonts. Fonts were the obvious
suspect here and were identical across all four.

## Reading a page's content by hand

```python
from pypdf import PdfReader
from pypdf.generic import ArrayObject

page = PdfReader('form.pdf').pages[0]
contents = page['/Contents']
contents = contents.get_object() if hasattr(contents, 'get_object') else contents
parts = [r.get_object().get_data() for r in contents] if isinstance(contents, ArrayObject) \
        else [contents.get_data()]
raw = b'\n'.join(parts)
```

That last line is the whole point: **resolve the array**. A script that reads
`/Contents` as a single stream silently sees a fragment. The first of DD 1610's
eight streams is 1,373 bytes that draw two rules and nothing else, which reads
like a nearly empty page rather than like a bug.

Then census what is in it. Marked content (`BDC`/`EMC`) dominates these forms
because LiveCycle tags everything for accessibility, and the tags are what make
the streams long without adding marks.

## A page that decodes to nothing, and reports success

SF 144 is not a LiveCycle form at all. It is a paper scan: `Producer: Adobe
Acrobat 9.33 Paper Capture Plug-in`, two pages, each one a single image.

```python
from pypdf import PdfReader
for i, page in enumerate(PdfReader('sf144.pdf').pages):
    for name, ref in page['/Resources']['/XObject'].items():
        o = ref.get_object()
        print(i, name, o['/Filter'], o['/Width'], o['/Height'])
# 0 /Im0 /JBIG2Decode 2556 3297
# 1 /Im0 /JBIG2Decode 2550 3292
```

pdfjs-dist 6.x decodes JBIG2 and JPEG 2000 through WebAssembly, fetched at
runtime from the directory named by the `wasmUrl` option. The option defaults to
null, and `getFactoryUrlProp` rejects any value without a trailing slash. With it
unset, `WasmImage` cannot load `jbig2.wasm`, the decode throws, and
`page.render()` resolves anyway over a white canvas. Measured on page 1:

```
sf144  no wasmUrl   ink 0.000
sf144  wasmUrl      ink 0.172
```

Nothing in the pipeline noticed. The naming pass received a blank sheet and
named 35 text fields and 9 buttons off it, because the widget geometry comes
from the annotation dictionaries and only the *labels* come from the image.

`src/lib/services/pdf-import/pdfjs.ts` carries `openPdf`, and every caller opens a document through it, so the option cannot be set on one path and missed on another. `vite.config.ts` copies `node_modules/pdfjs-dist/wasm/` to `static/pdfjs/wasm/` on `buildStart`, which covers dev, build and the vitest browser project alike. `corpus.svelte.test.ts` measures ink on every page raster of the six committed forms it reads, with the floor at 0.5% because DD 1610's continuation page is only 1.4%.

**The lesson worth keeping**: a renderer that resolves is not a renderer that
drew anything. Measure ink, not exceptions. SF 144 is the only JBIG2 file in the
corpus; SF 2809 uses CCITTFaxDecode, which pdf.js decodes natively without wasm.

## What is still out of reach, and why

**Dynamic XFA is no longer out of reach.** It was, and the two reasons were
real: `page.render()` paints nothing for a pure XFA document, because pdf.js
builds each page from an empty dictionary and the visible form is the XFA
layer's own DOM; and the geometry of a flowed subform comes out as CSS flex with
no coordinates, which only a layout engine resolves.

The answer to both is that the app runs in a browser, which is a layout engine.
`src/lib/services/pdf-import/xfa.ts` lays the template out with
`XfaLayer.render`, reads the rects the browser solved, and writes the page and
the fields back as an ordinary static AcroForm before anything else in the
pipeline sees the file. All ten convert. `XFA_INTERNALS.md` section 8 has the
mechanism, the five defects that had to be fixed, and what is still lost, which
is the embedded fonts.

**OF 1164, at 369 widgets.** The one form in the corpus the builder still turns
away, and the caps are right to. It is 365 rows of one repeating expense table,
and what it wants is repeating-row support in the format model rather than a
larger cap.

## A pdf.js bug, found the same way

One form in the corpus, DAF 1288, did not merely refuse to lay out: it took the
whole document down.

```
XFA - an error occurred during parsing and binding:
  TypeError: Cannot read properties of null (reading 'isXFAObjectArray')
XFA - an error occurred during layout:
  TypeError: Cannot read properties of undefined (reading 'Symbol()')
UnknownErrorException: Cannot read properties of undefined (reading 'length')
```

Three errors, one cause, and only the first is real. `Binder.bind()` throws, so
`XFAFactory.form` is never assigned; `_createPagesHelper` then reads a symbol off
`undefined`; `dims` is never set, and the third error is what reaches the caller.
Debugging the message you are given leads nowhere.

**The provenance was the tell.** Dumping the XFA packets from all three forms and
reading their `config`:

| | producer | `usehref=".#som(...)"` | `use="#uuid"` |
| --- | --- | ---: | ---: |
| daf1288 | `Designer 2024.07` | **43** | 5 |
| daf910 | `Designer 6.5` | 0 | 5 |
| daf707 | `Designer 6.5` | 0 | 7 |

Designer 2024.07 writes stylesheet prototype references as SOM expressions;
Designer 6.5 writes them as id references. Only the SOM form calls `searchNode`,
so only files from the newer Designer can reach the bug. Every other structural
difference between the three forms, and there are many, is irrelevant.

**The construct**, inside `<proto><subform name="designer__stylesheet">`:

```xml
<field name="TextFieldStyle1">
  <caption reserve="4.06mm" placement="top">
    <font size="11pt" typeface="Myriad Pro"/>
  </caption>                       <!-- no <para> child -->
</field>

<field name="TextFieldStyle5">
  <caption>
    <font usehref=".#som($template.#subform.designer__stylesheet.TextFieldStyle1.#caption.#font)"/>
    <para usehref=".#som($template.#subform.designer__stylesheet.TextFieldStyle1.#caption.#para)"/>
  </caption>
</field>
```

The `#font` reference resolves. The `#para` reference names a child that caption
does not have.

**The line.** `$getChildrenByClass` is `return this[name]`, and `Caption`'s
constructor sets `this.para = null` alongside `extras`, `font`, `margin` and
`value`. So an absent optional child is `null`, and `searchNode` does:

```js
children = node[$getChildrenByClass](name);
children = children.isXFAObjectArray ? children.children : [children];
```

`patches/pdfjs-dist+6.3.289.patch` applies the fix to `node_modules` on install. `patches/pdfjs-som-null-guard.diff` carries the same fix against pdf.js's source, with the evidence. Guarded, DAF 1288 goes from failing to load to two pages and 122 `xfaField` elements in pdf.js's layout (116 widgets in the inventory after conversion), all with non-zero geometry inside the page box, and the other 23 forms produce identical page and field counts. Two prototype references then warn and are skipped, which is correct: there is genuinely nothing to inherit, and the cost is caption text alignment on three styled fields.

It is unreported. The line came in with PR #13473 in June 2021; PR #13761 later
hardened every *caller* of `searchNode` against a null return "to prevent future
bugs" and left the inside alone. Both call sites are still unguarded on master.

The general lesson, again: **the error you are shown is the third one.** Trace
back to the first throw before forming a theory.

## What thirty-five more forms said

The first corpus was DoD and OPM, downloaded together, and it agreed with itself
too well. A second corpus of thirty-five was pulled afterwards from publishers
the first never touched: IRS, VA, USCIS, DOL, DOJ, and more of DoD. Six things
in it have no counterpart in the first twenty-four.

**The encryption ladder is wider than R4.** The first corpus is seventeen files
at Standard V4 R4 and nothing else. SF 61 and SF 75 are R2, 40-bit RC4, which is
qpdf's legacy decryptor path; DAF 4394 is V5 R6, AES-256. All three revisions
come out of the same `qpdf --decrypt`, which is the useful finding: the flag set
did not need widening.

```
$ qpdf --show-encryption sf61.pdf
R = 2 / P = -12 / User password =
$ qpdf --show-encryption daf4394.pdf
R = 6 / P = -1052 / User password =
```

**A duplicate field name is usually not a radio group.** Every repeated name in
the first twenty-four was one. SF 1152 repeats all thirty of its names exactly
twice, because the form ships an original and a file copy over one field tree;
WH-380-E repeats thirteen over seventeen extra widgets, eleven of them
checkboxes with no distinct on-state; I-9 repeats two. One name is one value in
the file, so those are one field painted twice, and reading them as separate
fields produces a format that asks for the same answer twice and ticks a whole
set of checkboxes at once.

**A wrapper document is not a form.** AF 3070A is a PDF 2.0 §7.6.7 unencrypted
wrapper from Microsoft Purview. Its catalog carries `/Collection`, and object 36
is a `/Filespec` with `/AFRelationship /EncryptedPayload` pointing at a 1.46 MB
`/EmbeddedFile` under `/Filter /MicrosoftIRMServices`. The single visible page
is the mandated cover sheet. The real three-page form, `/AcroForm 183 0 R`, is
inside the payload and needs a use licence from the issuing tenant, so qpdf,
pypdf and pdf.js all decline it. `IsCollectionPresent` is the general signal:
when the catalog declares a collection, page one is a cover sheet by
construction.

**An empty `/Fields` is not the same as no AcroForm.** SF 85 has an AcroForm
dictionary whose `Fields` array is empty, over eighteen pages; AF 3070A has no
AcroForm dictionary at all. Both inventory to nothing, and it is the first shape
that is likely to make downstream code assume fields exist.

```
$ qpdf --json --json-key=acroform sf85.pdf   | grep -E 'hasacroform|"fields"'
"hasacroform": true, "fields": []
$ qpdf --json --json-key=acroform af3070a.pdf | grep hasacroform
"hasacroform": false
```

**A whole publisher can carry no labels.** The IRS forms have zero `/TU` on
every field: Form 1040 is 199 fields and 199 blanks. On that class the naming
pass reads page rasters and nothing else, which the DoD corpus never
demonstrated because its forms are almost fully tooltipped.

**And `/TU` is not inherited.** Acrobat writes `/T` and `/TU` on the field and
puts bare widget annotations in `/Kids`. pdf.js walks `/Parent` for `/T` and
inherits `/FT` and `/MaxLen`, but reads `/TU` off the annotation, so every kid
of a split field arrives unlabelled: 16 of EOIR-28's 53, 32 of VA 26-1880's 81,
all 60 of SF 1152's, and 29 of OF 306's on the first corpus, where nobody had
noticed.

`demo/samples/README.md` describes both corpora.

## Reproducing all of this

```
node scripts/characterize-forms.mjs demo/samples/corpus/*.pdf
qpdf form.pdf --decrypt --qdf --object-streams=disable readable.pdf
qpdf --show-encryption form.pdf
exiftool -Producer -Creator -ModifyDate form.pdf
pdftotext -f 1 -l 1 form.pdf -
```

The corpus itself is gitignored. `demo/samples/README.md` records that `esd.whs.mil` and `static.e-publishing.af.mil` answer 403 to a plain `curl` and to parallel fetches.
