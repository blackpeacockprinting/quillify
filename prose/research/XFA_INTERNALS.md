# Adobe PDF and XFA internals

A structural reference for engineers who have to read and process real US
government forms. Companion to [`ADOBE_PDF_FORENSICS.md`](ADOBE_PDF_FORENSICS.md),
which records what this app's import pipeline found and fixed. This document is
the layer underneath: what the constructs *are*, what the specification says
about them, and what the bytes of 24 published federal forms actually contain.

Every spec claim carries a clause number. Every measured claim carries the
command that produced it. Claims that could not be verified are marked
**[UNVERIFIED]** rather than reconstructed.

## Scope of the measurements

The corpus is the 24 forms in `demo/samples/corpus/`: eight DAF from
`static.e-publishing.af.mil`, nine DD from `esd.whs.mil`, seven SF/OF from OPM
and GSA. Measured 2026-09-03 with qpdf 12.4.0, ExifTool 13.55, Ghostscript
10.07.1, Python 3.13.

| Class | Count |
| --- | --- |
| Dynamic XFA | 10 |
| Static (hybrid) XFA | 10 |
| Plain AcroForm, no `/XFA` | 4 |
| Encrypted | 17 |
| Carrying `/Perms /UR3` | 21 |
| XFA forms embedding zero fonts | 17 of 20 |
| Containing a Type 3 font | 0 |
| XFAF (XFA Foreground) | **0** |

The corpus contains no XFAF specimen, so every XFAF claim below is sourced,
not measured, and labelled as such.

## Sources that could not be reached

Stated up front because several load-bearing citations route around them.

- **`pdfa.org` returns HTTP 403** to every path, every user agent, curl and
  headless Chrome alike. The XFA 3.3 specification lives at
  `https://www.pdfa.org/norm-refs/XFA-3_3.pdf`. This URL is confirmed as the
  normative citation by Adobe's own SDK docs at
  `https://opensource.adobe.com/dc-acrobat-sdk-docs/acrobatsdk/` (fetched
  2026-09-03). But **it was never retrieved. No normative XFA text is quoted
  anywhere in this document.** XFA structure below comes from two independent
  implementations plus Adobe's Designer Scripting Reference.
- **`iso.org` returns HTTP 403.** ISO 32000-2:2020 was not read. Its clause
  numbers and deprecation flags come from the PDF Association's own
  machine-readable encoding of it, the
  [Arlington PDF Model](https://github.com/pdf-association/arlington-pdf-model)
  (HEAD `fe4a1a88`, dated 2026-08-30), and from verbatim spec quotes inside
  [`pdf-association/pdf-issues`](https://github.com/pdf-association/pdf-issues).
  Strong evidence, but second-hand.
- **ISO 32000-1:2008 was read in full**, from Adobe's free copy at
  `https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf`
  (22,491,828 bytes, fetched 2026-09-03). Everything quoted as "ISO 32000-1" is
  verbatim from that file.
- `esd.whs.mil` and `e-publishing.af.mil` both 403 automated clients; their
  content below is from Internet Archive snapshots with dates given.

---

# 1. The XFA packet set

## The two legal forms of `/Root /AcroForm /XFA`

ISO 32000-1:2008 clause 12.7.2, **Table 218**, verbatim:

> **XFA** (*stream or array*): (Optional; PDF 1.5) A stream or array containing
> an XFA resource, whose format shall be described by the Data Package (XDP)
> Specification. The value of this entry shall be either a stream representing
> the entire contents of the XML Data Package or **an array of text string and
> stream pairs** representing the individual packets comprising the XML Data
> Package.

Clause 12.7.8, verbatim:

> **A packet is a pair of a string and stream.** The string contains the name of
> the XML element and the stream contains the complete text of this XML element.
> **Each packet represents a complete XML element, with the exception of the
> first and last packet, which specify begin and end tags for the `xdp:xdp`
> element.**

Note the type: the first element of each pair is a **text string**, `(template)`,
not a name object. The Arlington model's `ArrayOfXFA.tsv` pins the rest:
`0*` is `string-text`, direct; `1*` is `stream`, `IndirectReference TRUE`. The
array form is PDF 1.6, the stream form PDF 1.5, and the whole key is
`DeprecatedIn 2.0`.

Adobe's own implementation note, PDF Reference 1.7 Appendix H note 115: *"Acrobat
6.0 recognizes only the stream value of the XFA entry; Acrobat 6.02 and later
recognize both stream and array values."*

## The names are not reliable. The positions are.

There are **three spellings for the same two wrapper slots**, and all three occur:

| Convention | Slot 0 | Slot n−1 | Seen in |
| --- | --- | --- | --- |
| Spec example (12.7.8) | `(xdp:xdp)` | `(/xdp:xdp)` | ISO 32000-1 only; found in no real file |
| Adobe, form A | `(xdp:xdp)` | `(</xdp:xdp>)` | 19 of 20 corpus XFA forms |
| Adobe, form B | `(preamble)` | `(postamble)` | `daf1297.pdf`; common in Designer ES 8.2–11 |

Measured across the corpus with a script that reads the array literally:

```
daf1206  xdp:xdp,config,template,datasets,localeSet,xmpmeta,xfdf,PDFSecurity,form,</xdp:xdp>
daf1297  preamble,config,template,localeSet,datasets,xmpmeta,xfdf,PDFSecurity,postamble
dd1610   xdp:xdp,config,template,localeSet,datasets,xmpmeta,xfdf,form,</xdp:xdp>
of306gsa xdp:xdp,config,template,datasets,localeSet,xmpmeta,form,</xdp:xdp>
```

The invariants that do hold, across all 20:

1. Slot 0 is the opening-tag fragment, whatever it is called.
2. Slot 1 is always `config`.
3. Slot 2 is always `template`.
4. The last slot is the closing fragment.
5. `form`, when present, is always the last real packet.
6. Everything between `template` and `form` varies by Designer version.

**Parse by position, not by name.** The two reference implementations both do,
by different routes.

pdf.js force-renames the ends
([`src/core/document.js`](https://github.com/mozilla/pdf.js/blob/master/src/core/document.js)):

```js
for (let i = 0, ii = xfa.length; i < ii; i += 2) {
  let name;
  if (i === 0) { name = "xdp:xdp"; }
  else if (i === ii - 2) { name = "/xdp:xdp"; }
  else { name = xfa[i]; }
  if (!entries.has(name)) { continue; }   // <- silently drops unknown packets
  ...
}
```

PDFBox never reads the names at all
([`PDXFAResource.java`](https://github.com/apache/pdfbox/blob/trunk/pdfbox/src/main/java/org/apache/pdfbox/pdmodel/interactive/form/PDXFAResource.java)):

```java
for (int i = 1; i < cosArray.size(); i += 2) {
    COSBase cosObj = cosArray.getObject(i);
    if (cosObj instanceof COSStream) {
        baos.write(getBytesFromStream((COSStream) cosObj.getCOSObject()));
    }
}
```

Take every odd index and concatenate. That reading survives every naming
convention above, and it preserves packets pdf.js throws away.

## The packet catalogue

The authoritative machine-readable table is PDFium's, inherited from Foxit's XFA
engine: [`xfa/fxfa/parser/packets.inc`](https://github.com/chromium/pdfium/blob/main/xfa/fxfa/parser/packets.inc).
pdf.js's `src/core/xfa/namespaces.js` agrees independently.

| Packet | Root element | Namespace | Contents |
| --- | --- | --- | --- |
| `preamble` / `xdp:xdp` | `<xdp:xdp …>` unclosed | `http://ns.adobe.com/xdp/` | Opening wrapper half; carries `uuid` and `timeStamp` |
| `config` | `<config>` | `.../xci/<ver>/` | XCI. How the processor renders and saves. **The static/dynamic discriminator lives here.** |
| `template` | `<template>` | `.../xfa-template/<ver>/` | The form design. Subforms, pageSet, fields, scripts, layout |
| `localeSet` | `<localeSet>` | `.../xfa-locale-set/<ver>/` | Frozen locale data so date and number formatting is viewer-independent |
| `datasets` | `<xfa:datasets>` | `.../xfa-data/1.0/` | Instance data plus optional data description |
| `xmpmeta` | `<x:xmpmeta>` | `adobe:ns:meta/` | XMP for the XDP itself, distinct from the PDF's `/Metadata` |
| `xfdf` | `<xfdf>` | `http://ns.adobe.com/xfdf/` | Annotations carried inside the package; usually just `<annots/>` |
| `form` | `<form>` | `.../xfa-form/<ver>/` | Cached template⋈datasets merge result. Carries a `checksum` attribute |
| `connectionSet` | `<connectionSet>` | `.../xfa-connection-set/<ver>/` | Web-service and XML-schema connection definitions |
| `sourceSet` | `<sourceSet>` | `.../xfa-source-set/<ver>/` | ADO data-source binding descriptors |
| `stylesheet` | `<xsl:stylesheet>` | `http://www.w3.org/1999/XSL/Transform` | XSLT over incoming or outgoing data. Repeatable |
| `pdf` | `<pdf>` | `http://ns.adobe.com/xdp/pdf/` | An embedded base PDF, inside a standalone `.xdp`. Not applicable to PDF-embedded XFA |
| `xdc` | `<xdc>` | `.../xdc/` | XFA Device Configuration, printer and output device |
| `signature` | `<Signature>` | `http://www.w3.org/2000/09/xmldsig#` | XML-DSig over XFA content |
| `postamble` / `</xdp:xdp>` | `</xdp:xdp>` | n/a | Closing wrapper half |

`xmpmeta`, `stylesheet` and PDFium's catch-all `user` are repeatable; the rest
are at most one.

**`log` is not a packet.** It is an XCI element at `config/common/log`. It appears
in no packet table, no namespace table, and no corpus file as a top-level
element. Do not put it in a packet whitelist.

Two names in the corpus are Adobe-proprietary and appear in no specification and
no packet table:

**`PDFSecurity`**. Present in 4 corpus forms. It mirrors the PDF permission
bits into XFA. Verbatim from `daf1297.pdf` (200 bytes):

```xml
<PDFSecurity xmlns="http://ns.adobe.com/xtd/" print="1" printHighQuality="0"
  change="0" modifyAnnots="0" formFieldFilling="1" documentAssembly="0"
  contentCopy="0" accessibleContent="1" metadata="0"/>
```

**`schema`**. An embedded `<xsd:schema>` backing an `<xsdConnection>`. Not in
the corpus, but it is a documented Designer feature: LiveCycle Designer 11 Help
p. 498, *"Select **Embed XML Schema** to embed the XML schema **as a packet in
the XDP file**."*

## The wrapper halves, byte for byte

Concatenating every pair's stream in array order reproduces the stream form
exactly. That is the whole point of the split.

Preamble from `dd1610.pdf` (162 bytes, no trailing newline):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/" timeStamp="2026-07-07T17:09:44Z" uuid="4c043ff3-3be1-4856-8bea-0942702e38ff">
```

Postamble (10 bytes, or 11 with a trailing `\n`; both occur, so do not depend
on it):

```
</xdp:xdp>
```

So a postamble stream is 10 or 11 bytes and contains nothing else. If your
detector sees a "packet" that small, it is the terminator.

## The `datasets` packet

```xml
<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
  <xfa:data> … instance data … </xfa:data>
  <dd:dataDescription xmlns:dd="http://ns.adobe.com/data-description/" dd:name="Form"> … </dd:dataDescription>
</xfa:datasets>
```

The `xfa-data` namespace is `1.0` in every corpus file, and iText hardcodes that
version.

`<xfa:data>` is the payload root and its children are arbitrary,
application-defined XML that the template's SOM expressions bind against. Empty
elements may carry `xfa:dataNode="dataGroup"` or `"dataValue"` to say whether an
empty element is a group or a value. Real example from `dd1610.pdf`, abridged.
Note the group markers and the pre-seeded `0` values for checkboxes:

```xml
<xfa:data><form1><page1>
  <Header><dateReq/></Header>
  <q2-4><name2/><ssn3/><position4/></q2-4>
  <q11><var11>0</var11><lodg11a>0</lodg11a><oth11b>0</oth11b></q11>
  <q12><L8 xfa:dataNode="dataGroup"/>
       <Left12><CBtravel><Commercial><CBr>0</CBr><CBa>0</CBa></Commercial></CBtravel></Left12></q12>
  <q18 xfa:dataNode="dataGroup"/>
</page1></form1></xfa:data>
```

`<dd:dataDescription>` is a **sibling of `<xfa:data>`**, not a child, in
namespace `http://ns.adobe.com/data-description/`. It is the shape of the data,
used when merging incoming data or generating nodes. Its `dd:name` is the join
key to a `<xsdConnection dataDescription="…">` in the `connectionSet` packet.
Attributes seen in the wild: `dd:name`, `dd:reqAttrs`, `dd:minOccur`,
`dd:nullType`.

## `/NeedsRendering`

**It lives in the document catalog, `/Root`.** Confirmed: ISO 32000-1:2008
clause **7.7.2, Table 28**. Not 12.7.8, which never mentions it. Verbatim:

> **NeedsRendering** (*boolean*): (Optional; PDF 1.7) A flag used to expedite
> the display of PDF documents containing XFA forms. It specifies whether the
> document shall be regenerated when the document is first opened.
> **Default value: false.**

Adobe's PDF Reference 1.7 Table 3.25 carries the semantics ISO trimmed:

> **If true, the viewer application treats the document as a shell and
> regenerates the content when the document is opened, regardless of any dynamic
> forms settings that appear in the XFA stream itself.** If false, the viewer
> application does not regenerate the content when the document is opened.

Type boolean, optional, default false, introduced PDF 1.7, **deprecated in PDF
2.0** (Arlington `Catalog.tsv`, `DeprecatedIn 2.0`).

PDF/A-2 onward forbids it. veraPDF `PDFA-2B.xml`, rule ISO 19005-2 clause
**6.4.2** test 2: *"A document's Catalog shall not contain the NeedsRendering
key"* (`NeedsRendering == false`), paired with test 1 on the same clause
forbidding `/XFA`. Both rules are **absent from PDF/A-1**. PDF/A-1 tolerates
XFA; PDF/A-2 (2011) banned it, six years before PDF 2.0 deprecated it.

## `/XFA` against `/Fields`, `/DA`, `/DR`

ISO 32000-1 clause 12.7.8 states three rules a conforming writer "shall follow":

> - **PDF interactive form field objects shall be present for each field
>   specified in the XFA resource.** The XFA field values shall be consistent
>   with the corresponding V entries of the PDF field objects.
> - The XFA Scripting Object Model (SOM) specifies a naming convention that
>   shall be used to connect interactive form field names with field names in
>   the XFA resource.
> - No A or AA entries shall be present in the annotation dictionaries of fields
>   that also have actions specified by the XFA resource.

**Dynamic XFA violates rule 1 outright, and ships that way from Adobe's own
tool.** That non-conformance is the detection signal, and it is the subject of
the next section.

`/DA` and `/DR` belong to the AcroForm shadow widgets only; XFA has its own
typography in the template's `<font typeface="…">`. In every corpus form `/DA` is
the same boilerplate `(/Helv 0 Tf 0 g )`, size 0 and black, i.e. a placeholder
rather than design intent. `/DR` fonts and XFA `typeface` names are separate namespaces
that routinely fail to resolve against each other; pdf.js carries a whole
`xfa_fonts.js` reconciliation layer because of it.

---

# 2. Static, dynamic and XFAF, from the bytes

## What produces each

Adobe LiveCycle Designer 11 Help, "Saving forms", p. 33, verbatim:

- **Static XFA** = Save As Type `Adobe Static PDF Form (*.pdf)`. *"Static PDF
  forms render once and are displayed on the client… They are not rerendered in
  response to user interaction. **The PDF form may have been designed with a
  flowable layout; however, when the static PDF form is created, its layout is
  fixed.**"*
- **Dynamic XFA** = `Adobe Dynamic XML Form (*.pdf)`. *"Dynamic PDF forms render
  on the client in Adobe Reader and, depending on the end-user interactions, can
  rerender on the client several times."*
- **XFAF** has no save-as type. It is the *import* path. New Form Assistant,
  "Create an Interactive Form with Fixed Pages", followed by a static save.
  Designer 11 Help p. 137: *"you must save the resulting form as an Adobe Static
  PDF Form. You cannot save the form as an Adobe Dynamic XML Form."*

The strings "XFAF" and "XFA Foreground" appear nowhere in Designer's
documentation. They are renderer-side terms, used identically by two independent
implementations:

- pdf.js `src/core/catalog.js`: `/** @type {boolean} 'true' for pure XFA
  documents, 'false' for XFA Foreground documents. */`
- PDFium `fpdfsdk/fpdf_view.cpp`:
  `return bNeedsRendering ? FORMTYPE_XFA_FULL : FORMTYPE_XFA_FOREGROUND;`

## The measured signature

Three predicates, computed over all 24 corpus forms. **All three invariants hold
without exception:**

```
NeedsRendering true  <=>  config dynamicRender == "required"     : True (10/10)
dynamicRender required  =>  zero /Subtype /Widget annotations    : True (10/10)
dynamicRender forbidden =>  at least one /Subtype /Widget         : True (10/10)
```

| | Dynamic (10) | Static/hybrid (10) | Plain AcroForm (4) |
| --- | --- | --- | --- |
| `/Root /NeedsRendering` | `true` | absent | absent |
| `config … <dynamicRender>` | `required` | `forbidden` | n/a |
| `/AcroForm /Fields` | `[ ]` empty | one root, deep `/Kids` tree | flat, populated |
| `/Subtype /Widget` count | **0** | 21–369 | 44–109 |
| Form XObjects | 0 | 20–84 | 59–179 |
| Page 1 content | "Please wait" placeholder | the real printed form | the real form |
| Base page count | 1 | 1–3 | 2–18 |

The two AcroForm dictionaries side by side say it in one line each. Static
`dd1610.pdf`:

```
<< /DA (/Helv 0 Tf 0 g ) /DR << /Font << … >> >> /Fields [ 16 0 R ] /SigFlags 3
   /XFA [ (xdp:xdp) 17 0 R (config) 19 0 R (template) 21 0 R … ] >>
```

Dynamic `daf1206.pdf`:

```
<< /DA (/Helv 0 Tf 0 g ) /DR << /Font << … >> >> /Fields [ ] /SigFlags 2
   /XFA [ (xdp:xdp) 17 0 R (config) 19 0 R (template) 21 0 R … ] >>
```

`/Fields [ 16 0 R ]` against `/Fields [ ]`. That is the whole distinction, and
it is exactly the ISO 32000-1 rule that dynamic XFA breaks.

## Count leaf widgets, not array length

`dd1610.pdf`'s `/Fields` array has **length 1**. That one root, `form1[0]`, has a
nested `/Kids` hierarchy mirroring the XFA SOM which resolves to **47 leaf
widgets** with real `/Rect` and `/FT`. A detector that tests
`len(Fields) > 1` gets the wrong answer on every static XFA form in the corpus.

There is a second trap in the other direction. A dynamic form may carry an
`/Fields` array holding *only* an invisible document-signature widget:
`/FT /Sig`, `/Rect [0 0 0 0]`, `/SigFlags 3`. pdf.js is the only implementation
that handles it, in `get formInfo()`:

```js
// The document contains AcroForm data if the `Fields` entry is a
// non-empty array and it doesn't consist of only document signatures.
```

`#hasOnlyDocumentSignatures` counts a field only when `FT == /Sig` **and**
`/Rect` is all zeros. PDFBox's equivalent, `xfaIsDynamic()`, is
`hasXFA() && getFields().isEmpty()`, and it returns **false** on such a file,
which is how a dynamic form gets past `PDFMergerUtility`'s guard and merges as a
placeholder page.

## `dynamicRender` is the config-packet discriminator

`<config><acrobat><acrobat7><dynamicRender>`, values `forbidden` | `required`,
default `forbidden`. pdf.js `src/core/xfa/config.js`:

```js
super(CONFIG_NS_ID, "dynamicRender", ["forbidden", "required"]);
```

This is the test PDF/UA-1 clause 7.15 uses. veraPDF
`PDF_UA/1/7.15 XFA/verapdf-profile-7-15-t01.xml`, complete rule:

```xml
<id specification="ISO_14289_1" clause="7.15" testNumber="1"/>
<description>Dynamic XFA forms shall not be used</description>
<test>dynamicRender != 'required'</test>
```

**It does not separate XFAF from dynamic.** A confirmed XFAF specimen
(`https://bugzilla.mozilla.org/attachment.cgi?id=9229296`, classified as XFAF by
pdf.js's XFA author in
[bug 1718638](https://bugzilla.mozilla.org/show_bug.cgi?id=1718638) comment 2)
carries `<dynamicRender>required</dynamicRender>` while having no
`/NeedsRendering` and a populated `/Fields`. The template was authored
dynamic-capable; the *save* was fixed-pages. Use `dynamicRender` as a
template-intent signal and `/NeedsRendering` as the save-format signal.

## Three config elements that are not discriminators

Worth stating because each is a plausible guess that measurement kills.

- **`<renderPolicy>`** (`server` | `client`, default `server`). Absent entirely
  from Adobe's static samples and from the XFAF specimen; present as `client` in
  dynamic files. Correlated but unreliable, because absence is the common case.
- **`<scriptModel>`** is `XFA` | `none` only. There is no `both`, that value
  belongs to `<script><runScripts>`. Every corpus form, static and dynamic, sets
  `XFA`.
- **`<interactive>` and `<tagged>`** are 0/1 flags, default 0, and orthogonal.
  Adobe: *"Static PDF forms can be interactive or non-interactive."*

**`layout="tb"` on the root subform does not mean dynamic either.** Every XFA
form in the corpus has `layout="tb"` at the root, static and dynamic alike, and
so do both of Adobe's shipped static samples and the XFAF specimen. `layout` is
a design-time property; the flavor is a save-time property. Designer 11 Help
p. 33 says so directly: a flowable design saved static is flattened to fixed
geometry.

## The XFAF page: marked content named after the template

**[Sourced, not measured. The corpus contains no XFAF form.]** In the XFAF
specimen the page content is 35 bytes:

```
/ContentArea BMC
q
/Fm0 Do
Q
EMC
```

`/Resources` has no `/Font`, only `/XObject`. Descending `/Fm0` gives a
recursive tree of 33 Form XObjects whose marked-content tags are named after XFA
template constructs, and the census matches the template exactly:

| Tag | XObject tree | `template` packet |
| --- | --- | --- |
| `ContentArea` | 1 | n/a |
| `Subform` | 7 | `<subform>` × 7 |
| `Draw` | 11 | `<draw>` × 11 |
| `Field` | 14 | `<field>` × 14 |

The XFAF discriminator: **21 `BT` blocks, zero `Tj`/`TJ`.** Every `/Draw` and
`/Field` leaf that would hold text is literally `BT\nET\n`. The rules, boxes and
one image are present; all glyphs are absent. That is what "XFA Foreground"
means, and why the bug reporter saw "all text is missing".

## The "Please wait" placeholder

There are at least two placeholder pages, and the widely-copied detectors miss
one of them.

**Variant A**, the classic. Verbatim from the decompressed content stream of
`daf1206.pdf`, with the operators, complete:

```
BT
/Content <</MCID 0 >>BDC
0 0 0 rg
/RelativeColorimetric ri
/T1_0 1 Tf
24 0 0 24 72 703.32 Tm
(Please wait... )Tj
12 0 0 12 72 685.02 Tm
(  )Tj
0 -1.109 TD
(If this message is not eventually replaced by the proper contents of the document, your PDF )
Tj
T*
(viewer may not be able to display this type of document. )Tj
T*
(  )Tj
T*
(You can upgrade to the latest version of Adobe Reader for Windows\256, Mac, or Linux\256 by )
Tj
T*
(visiting  http://www.adobe.com/go/reader_download. )Tj
T*
(  )Tj
T*
(For more assistance with Adobe Reader visit  http://www.adobe.com/go/acrreader. )
Tj
T*
(  )Tj
8 0 0 8 72 568.02 Tm
(Windows is either a registered trademark or a trademark of Microsoft Corporation in the United States and/or other countries. Mac is a trademark )
Tj
T*
(of Apple Inc., registered in the United States and other countries. Linux is the registered trademark of Linus Torvalds in the U.S. and other )
Tj
T*
(countries.)Tj
EMC
ET
```

**Variant C**, from Designer 11.0. **[Sourced, not measured. No corpus form
carries a Designer 11.0 producer string.]** It contains neither "Please wait"
nor "eventually replaced":

```
The document you are trying to load requires Adobe Reader 8 or higher. You may
not have the Adobe Reader installed or your viewing environment may not be
properly configured to use Adobe Reader.
```

Every string-matching detector reviewed misses Variant C. Two earlier variants
exist from the Designer 7.x and Acrobat 6/7 eras with different URLs.

### How the placeholder page is built

Measured on `daf1206.pdf` and `dd2977.pdf`:

| | |
| --- | --- |
| Text location | The page's own `/Contents`. **No Form XObject.** `/Resources` is `/Font` + `/ProcSet` only |
| Font | `<< /BaseFont /Times-Roman /Encoding /WinAnsiEncoding /Subtype /Type1 /Type /Font >>`, **standard-14, not embedded** |
| Sizes | 24 pt headline, 12 pt body, 8 pt trademark footer |
| Link annotations | **None.** The URLs are drawn text |
| `/OpenAction` | Absent |
| Document JavaScript | **Present**: `/Root /Names /JavaScript` with `!ADBE::0100_VersChkStrings`, `!ADBE::0100_VersChkVars`, `!ADBE::0200_VersChkCode_XFACheck` |
| Tagging | `/Content <</MCID 0>> BDC … EMC`, `/StructParents 0`, catalog `/MarkInfo` + `/StructTreeRoot`. The placeholder is tagged |
| `/MediaBox` | `[0.0 792.0 612.0 0.0]` on `daf1206`, **y-inverted**. A parser assuming normalized ordering computes a negative height |

The JavaScript is the active nag beside the passive page. It tests
`xfa_version < 2.8`, and on failure offers `this.getURL(ADBE.Reader_Value_New_Version_URL + ADBE.SYSINFO)`
where `SYSINFO` is `"?p=" + app.platform + "&v=" + app.viewerVersion + "&l=" + app.language + …`.
It phones home.

### Byte-level gotchas that defeat naive grep

- `®` is the octal escape `\256` (WinAnsi 0xAE), not UTF-8.
- Long lines use backslash + bare CR literal-string continuation, so `document`,
  `Mac`, `Corporation`, `Linux` and `acrreader` are split mid-word in the file
  bytes.

**Grep the decoded text, never the raw stream.** And prefer the structural test
(`/NeedsRendering true` with an empty `/Fields`) over any string match.

## Detection, in one procedure

```
has_xfa      := /Root/AcroForm/XFA present AND non-empty
needs_render := /Root/NeedsRendering == true
real_fields  := /Fields walked through /Kids to LEAF widgets,
                dropping any with FT==/Sig and Rect==[0 0 0 0], count > 0
dyn_render   := config … <dynamicRender> == "required"
```

| Verdict | Test |
| --- | --- |
| Not XFA | `!has_xfa` |
| **Dynamic XFA** | `needs_render` |
| **XFAF** | `has_xfa && !needs_render && real_fields`, and the page content is a `/ContentArea BMC` XObject tree with zero text-showing operators |
| **Static XFA** | `has_xfa && !needs_render && real_fields`, and the page carries real glyphs |

Never use `has_xfa && !real_fields` alone. It false-negatives on a dynamic form
carrying an invisible signature and false-positives on a field-less static form.

---

# 3. The XFA template language, structurally

No normative XFA text is quoted here. See the source note at the top. This
section is grounded in two complete independent implementations,
[pdf.js `src/core/xfa/`](https://github.com/mozilla/pdf.js/tree/master/src/core/xfa)
and [PDFium `xfa/fxfa/`](https://github.com/chromium/pdfium/tree/main/xfa/fxfa),
plus Adobe's Designer Scripting Reference at
`https://help.adobe.com/en_US/AEMForms/6.1/DesignerScriptingRef/index.html`
(reachable, fetched 2026-09-03), and cross-checked against the corpus. PDFium is
the better source for **defaults**, which it encodes in per-element static
tables; pdf.js is the better source for **layout behaviour**.

## Container hierarchy

```
<template>
└── <subform>                  exactly one root (pdf.js warns on 0 or >=2)
    ├── <pageSet>              master-page sequence
    │   └── <pageArea>         one rendering surface
    │       ├── <medium>       physical sheet
    │       ├── <contentArea>  the flow region
    │       └── <draw> <field> <area> <subform> …
    ├── <subform>              nested containers
    ├── <subformSet>           transparent grouping, no geometry
    ├── <area>                 transparent positional group
    ├── <exclGroup>            mutual exclusion, holds <field> only
    ├── <field>                interactive leaf
    └── <draw>                 non-interactive leaf
```

Two of those are **transparent** and will break a naive tree walk:

- **`<subformSet>`** has no geometry and no layout. It groups subforms for
  occurrence and relation purposes and is *flattened at layout time*. pdf.js
  yields its children in place of it, and `[$getSubformParent]()` walks up past
  it. Treat its children as direct children of the enclosing subform.
- **`<area>`** has `x` and `y` but **no `w`, `h`, `layout` or `anchorType`**. It
  offsets its children and reports a computed extent. `[$isTransparent]()`
  returns true unconditionally, which also makes it invisible to SOM path
  resolution.

`<medium>` is the one to watch for attribute naming: it is **`long` and `short`**,
not `w`/`h`, plus `orientation` (default `portrait`), `stock`, `imagingBBox`
(four comma-separated measurements, default the string `"none"`), `trayIn`,
`trayOut`. Real example from `dd1610.pdf`:

```xml
<medium stock="default" short="612pt" long="792pt"/>
```

`<contentArea>` holds **no content**. Its only children are `desc` and `extras`.
It is a target into which flowed body subforms are poured:

```xml
<contentArea x="6.35mm" w="203.2mm" h="257.81mm" y="8.89mm" name="ContentArea"/>
```

## `layout`: seven values, and what each does

Legal values, exactly seven, confirmed identically by both implementations.
pdf.js `template.js`:

```js
this.layout = getStringOption(attributes.layout, [
  "position", "lr-tb", "rl-row", "rl-tb", "row", "table", "tb",
]);
```

`getStringOption` returns `options[0]` on absent or invalid input, so **the
default is `position`**. PDFium's table agrees:
`{XFA_Attribute::Layout, XFA_AttributeType::Enum, (void*)XFA_AttributeValue::Position}`.

**`layout` appears on `<subform>` and `<exclGroup>` only.** Not on `<area>`, not
on `<field>`, not on `<draw>`. Code that looks for it on `<area>` gets
`undefined` and silently falls through to positioned.

| Value | Effect on child positioning |
| --- | --- |
| `position` | Absolute. Children keep their own `x`/`y`; the parent's extent is a bounding-box union. **The only positioned strategy.** |
| `lr-tb` | Children flow left-to-right on a line, lines stack top-to-bottom. Two-pass: try the current line, else start a new one. |
| `rl-tb` | Identical, but the line runs right-to-left. **Line stacking order is unchanged**, only intra-line direction differs. |
| `tb` | Pure vertical stack, one child per row. |
| `row` | One horizontal band; children are the cells of a table row. Extent is the sum of child widths and the max of child heights, then **every cell is stretched to the row height**. |
| `rl-row` | As `row`, reversed visual order. |
| `table` | A vertical stack of `row`/`rl-row` subforms. Accumulates like `tb`. |

**`position` is the only positioned value; the other six are all flowed.** The
load-bearing evidence is pdf.js `html_utils.js`, which discards geometry under
any other layout:

```js
function fixDimensions(node) {
  if (parent.layout && parent.layout !== "position") {
    node.x = node.y = 0;                       // Useless in this context.
  }
}
position(node, style) {
  if (parent?.layout && parent.layout !== "position") {
    // Specs say x/y is only used in positioned layout.
    return;
  }
  style.position = "absolute";
  style.left = measureToString(node.x);
  style.top  = measureToString(node.y);
}
```

`anchorType`, `rotate`, and the `minW`/`maxW`/`minH`/`maxH` constraints are
**honoured only under `position`**. Under a flowed layout they are ignored.

Two consequences worth carrying:

- **Splittability is layout-dependent.** `position`, `row` and `rl-row`
  containers can never be split across a content-area or page boundary
  (`$isSplittable` returns false), nor can any container with
  `<keep intact="…">`.
- **ARIA falls out of layout** in pdf.js: `table` → `role="table"`, `row` →
  `role="row"`, a child of a `row` → `role="cell"`, or `columnheader` when the
  parent's `assist.role` is `TH`.

### Tables and `columnWidths`

`columnWidths` sits on the **table** subform, parsed as whitespace-separated
measurements with `-1` meaning auto. The **row** subform inherits the array from
its parent and walks a cursor across it. A cell's width is the slice
`[currentColumn, currentColumn + colSpan)`:

```js
if (colSpan === -1) {
  w = Math.sumPrecise(extra.columnWidths.slice(extra.currentColumn));
  extra.currentColumn = 0;                     // -1 = span the rest
} else {
  w = Math.sumPrecise(extra.columnWidths.slice(extra.currentColumn,
                                               extra.currentColumn + colSpan));
  extra.currentColumn = (extra.currentColumn + node.colSpan) % extra.columnWidths.length;
}
if (!isNaN(w)) { width = node.w = w; }
```

**A cell's own `w` is overwritten by the column geometry.** And a table with no
`w` of its own takes the sum of its columns.

Measured layout histogram for `dd1610.pdf`: `lr-tb` × 29, `tb` × 3. Positioned
subforms do not appear in that form at all.

## `<occur>`

Attributes `min`, `max`, `initial`, all integers. **`max="-1"` means unbounded.**
Adobe on `max`, verbatim: *"Specifies the maximum number of occurrences for the
enclosing container, **or -1 to set no upper boundary for occurrences**."*
PDFium's merge loop is literally `for (; iMax < 0 || iCurRepeatIndex < iMax; …)`.

**Defaulting is context-sensitive, and the two implementations disagree.** PDFium
uses a flat table (`min=1, max=1, initial=1`); pdf.js implements the richer rule
in `Occur[$clean]()`:

```js
if (this.min === "") { this.min = (parent instanceof PageArea || parent instanceof PageSet) ? 0 : 1; }
if (this.max === "") {
  if (originalMin === "") { this.max = (parent instanceof PageArea || parent instanceof PageSet) ? -1 : 1; }
  else { this.max = this.min; }
}
if (this.initial === "") { this.initial = parent instanceof Template ? 1 : this.min; }
```

So under `pageArea`/`pageSet` an omitted `occur` means min 0, max −1. Unbounded
pages. Under a subform it means exactly once. **Implement pdf.js's rule; PDFium's
flat defaults cannot repeat a master page.**

`<occur>` is legal only on `subform`, `subformSet`, `pageArea` and `pageSet`.
Never on `field`, `draw`, `exclGroup` or `area`.

During data merge, `min`/`max` bound how many data matches one template node
consumes; `initial` seeds instances when there is no data. Extra matches cause
the template node to be **cloned, with `occur` stripped from the clone** so it
does not re-expand. `min === 0` with no data deletes the container entirely.

## `<bind>`

`match` takes exactly four values: `once` (default), `none`, `global`,
`dataRef`, plus a `ref` attribute.

| `match` | Behaviour |
| --- | --- |
| `once` | Normal name-based merge. Consumes the next unconsumed data node whose name matches. Creates one if absent. |
| `none` | Bound to the current data scope but **consumes nothing**. Descendants still bind against that scope. |
| `global` | Name lookup escapes the local scope. PDFium consults a document-wide registry and creates missing nodes under `$record`. |
| `dataRef` | `ref` is a **SOM expression evaluated against the data DOM**, not a name. **Can create data nodes when it resolves to nothing.** |

The root subform is special: it and the current record are always bound **even
if their names do not match**. `mergeMode` on the first subform selects the
algorithm globally: `consumeData` (default) stamps matched nodes consumed so
siblings cannot re-take them; `matchTemplate` fabricates missing data nodes to
mirror the template.

Corpus reality is thin: `dd1610.pdf` contains 13 `<bind>` elements, of which the
only distinct forms are `<bind match="none"/>` and a bare `<bind>`.

## SOM expressions

Adobe's shortcut table, from the FormCalc Reference "Reference Syntax" chapter:

| Notation | Meaning |
| --- | --- |
| `$` | The current object (`this` in JavaScript) |
| `$data` | Root of the data model, `xfa.datasets.data` |
| `$record` | The current record |
| `$template` | Root of the template model |
| `$form` | Root of the form model |
| `$host` | The host object |
| `$layout`, `$event` | Layout and event models |
| `!` | Root of the data model, `xfa.datasets` |
| `*` | Select all form objects |
| `..` | Descendant search |
| `#` | Denote an unnamed object, or specify a property |
| `[n]` `[+n]` `[-n]` `[*]` | Occurrence index |

pdf.js implements a superset including `$connectionSet`, `$dataWindow`, `$xfa`
and bare `xfa`. PDFium dispatches on the leading character and accepts the
`XFA_HASHCODE_*` model set (`config`, `connectionSet`, `data`, `dataDescription`,
`datasets`, `dataWindow`, `event`, `form`, `host`, `layout`, `localeSet`, `log`,
`record`, `signature`, `sourceSet`, `template`, `this`, `xdc`, `XDP`, `xfa`,
`xfdf`, `xmpmeta`).

Operators, from pdf.js `parseExpression`:

```js
const operators = { dot: 0, dotDot: 1, dotHash: 2, dotBracket: 3, dotParen: 4 };
```

- `.name`: children by name
- `..name`: **descendant search through all nodes**, transparent or not
- `.#class`: children by class. `$getChildrenByClass` is literally
  `return this[name]`, so `#subform` yields the `subform` array, `#field` the
  `field` array
- `.[…]` and `.(…)`: FormCalc and JavaScript predicate subexpressions. **PDFium
  implements them; pdf.js warns and returns null.**

Indices are **0-based absolute**; `[*]` flattens the collection. Adobe documents
relative forms `[+n]`/`[-n]`: *"an occurrence relative to the occurrence of the
object making the reference"*, which PDFium implements and **pdf.js silently
mishandles**, because `parseInt("+2", 10) || 0` yields `2`, an absolute index.

A backslash escapes a literal dot inside a name segment (`\.`). PDFium handles
it; pdf.js's `namePattern = /^[^.[]+/` does not.

### Composing a full name

Adobe's anatomy: **root → model → form-design root → page → subform → object →
property**:

```
xfa.form.form1.#subform[0].TextField1.rawValue
```

**When `name` is absent the node is addressed by its class with `#`.** Adobe:
*"By default, the subform object that represents the first page of a new form is
unnamed… the unnamed subform is represented by `#subform`."* Omitting the index
selects occurrence 0. `#` also disambiguates a property from a same-named child:
`xfa.form.form1.#subform.#name`.

A missing `name` has a second, subtler effect: **the node becomes
SOM-transparent** and the traversal descends through it automatically. pdf.js:

```js
[$isTransparent]() { return !this.name; }
```

Two more traversal facts: `parent` is a reserved segment meaning the parent node,
and **attributes are addressable as the final segment** of a SOM path.

Unqualified expressions that match nothing walk **up** the container chain and
retry. The classic SOM scoping rule.

`resolveNode` exists because `#`, `[`, `]`, `*` and `..` are not valid JavaScript
identifier syntax. Adobe: *"FormCalc correctly interprets the number sign (`#`)
and square bracket (`[ ]`) characters; however, JavaScript does not."*

Measured across the corpus, the real API surface is small and blunt:

```
xfa.event.change      264      xfa.resolveNode      15
xfa.host.messageBox   204      xfa.host.name        12
xfa.host.setFocus     176      xfa.layout.pageCount 11
xfa.event.newText      80      xfa.host.numPages     8
```

and the dominant idiom is show/hide by presence, not layout manipulation:

```js
this.resolveNode("RaterSign").presence = "invisible"
this.resolveNode("SecIIImanualSignature").presence = "visible"
```

## `<ui>` against `<value>` against `<caption>`

Three orthogonal subtrees on a `<field>`. **`<ui>` is how it is edited,
`<value>` is what it holds, `<caption>` is its label.**

**`<ui>`** takes exactly one of eleven widget children, marked `kOneOf` in
PDFium's `kUiPropertyData`: `barcode`, `button`, `checkButton`, `choiceList`,
`dateTimeEdit`, `defaultUi`, `imageEdit`, `numericEdit`, `passwordEdit`,
`signature`, `textEdit`, plus non-exclusive `picture` and `extras`.

`<ui>` is optional. pdf.js fabricates one, and its source comment carries the
rule it implements: *"If the UI element contains no children or is not present,
the application chooses a default user interface for the container, based on the
type of the container's content."* That sentence reaches this document through
the pdf.js comment, not from the XFA specification, which was never retrieved.
Its `items.length` heuristic (0 → textEdit, 1 → checkButton, 2 → choiceList) is a
pdf.js guess with no cited basis.

**`<value>`** takes exactly one of thirteen, all `kOneOf`: `arc`, `boolean`,
`date`, `dateTime`, `decimal`, `exData`, `float`, `image`, `integer`, `line`,
`rectangle`, `text`, `time`. Note that `arc`, `line` and `rectangle` are the
**drawing primitives**. A rectangle in an XFA form is
`<draw><value><rectangle/></value></draw>`, not a dedicated element. `exData` is
the rich-content carrier and is how XHTML gets into a field.

Measured across all 20 corpus templates:

```
<ui> children:    textEdit 2341, numericEdit 434, checkButton 335,
                  dateTimeEdit 251, signature 96, choiceList 91,
                  button 29, picture 9, defaultUi 6
<value> children: text 1482, exData 554, line 537, integer 255,
                  date 216, rectangle 189, decimal 164, image 33
```

**`<caption>`** carries `placement` (`left` default, plus `bottom`, `inline`,
`right`, `top`), `presence`, and `reserve`, the space set aside along the
placement axis, where `-1` or `<= 0` means auto. PDFium's default is the sentinel
`L"-1un"`; `un` is not a real unit, so it parses as −1. `<draw>` has a caption
too.

## Measurements and units

The legal unit set, from PDFium
[`cxfa_measurement.cpp`](https://github.com/chromium/pdfium/blob/main/xfa/fxfa/parser/cxfa_measurement.cpp):

```cpp
if (wsUnit.EqualsASCII("mm")) return XFA_Unit::Mm;
if (wsUnit.EqualsASCII("pt")) return XFA_Unit::Pt;
if (wsUnit.EqualsASCII("in")) return XFA_Unit::In;
if (wsUnit.EqualsASCII("cm")) return XFA_Unit::Cm;
if (wsUnit.EqualsASCII("pc")) return XFA_Unit::Pc;
if (wsUnit.EqualsASCII("mp")) return XFA_Unit::Mp;
if (wsUnit.EqualsASCII("em")) return XFA_Unit::Em;
if (wsUnit.EqualsASCII("%"))  return XFA_Unit::Percent;
return XFA_Unit::Unknown;
```

**Eight units: `in`, `cm`, `mm`, `pt`, `pc`, `mp`, `em`, `%`.** The conversion
constants, all to points:

| Unit | To points | Note |
| --- | --- | --- |
| `pt` | ×1 | |
| `in` | ×72 | |
| `cm` | ×28.3465 | 72/2.54 |
| `mm` | ×2.83465 | |
| `pc` | ×12 | picas |
| **`mp`** | **×0.001** | **millipoint = 1/1000 pt. Confirmed.** |
| `em`, `%` | n/a | Context-relative. PDFium's generic path **evaluates them to 0pt** |

**The default for a bare number is a live interoperability hazard.** PDFium
yields `XFA_Unit::Unknown`, which converts to **0**. pdf.js passes the value
through **as points**, because its converter table has no fallthrough, and that
table has no `mp`, `pc`, `em` or `%` entry at all:

```js
const dimConverters = { pt: x => x, cm: x => (x/2.54)*72, mm: x => (x/(10*2.54))*72,
                        in: x => x*72, px: x => x };
…
const conv = dimConverters[unit];
if (conv) return conv(value);
return value;                 // unknown unit: value used verbatim
```

So `w="5000mp"` (= 5 pt) renders in pdf.js as **5000 px, a 1000× error**.
Implement PDFium's table. **[UNVERIFIED]** what the XFA spec says the default
unit is. The spec was unreachable, and both implementations' behaviour is a
choice, not a quoted rule.

Corpus reality is mercifully narrow. Unit suffixes across `dd1610.pdf`'s
geometry attributes: **`mm` × 335, `in` × 19.** Nothing exotic.

### Origin and axis direction

**XFA is top-left origin with +y down. This is the opposite of PDF user space.**
Adobe's Designer Scripting Reference, identical wording on `subform`, `area`,
`contentArea`, `draw`, `field` and `exclGroup`:

> **x**: *"Specifies the X coordinate of the container's anchor point relative
> to the **top-left corner** of the parent container when placed with positioned
> layout."*
> **y**: *"…relative to the **top-left corner** of the parent container…"*

and Designer Help p. 347: *"The X coordinate defines the horizontal position of
the object relative to the **left edge** of the subform. The Y coordinate defines
the vertical position… relative to the **top edge**."*

ISO 32000-1 §8.3.2.3 puts PDF user space at bottom-left with +y up. **Any
XFA→PDF renderer must flip.** Skipping the flip is what produces upside-down XFA
output. pdf.js sidesteps it entirely by rendering to HTML with
`position:absolute; left; top`, which is natively top-left.

### `anchorType` and `rotate`

`anchorType` takes nine values, default `topLeft`: `topLeft`, `topCenter`,
`topRight`, `middleLeft`, `middleCenter`, `middleRight`, `bottomLeft`,
`bottomCenter`, `bottomRight`. It is on `subform`, `field`, `draw` and
`exclGroup`: **not on `area`**. The anchor is both the point `x,y` names and the
pivot rotation turns about. Designer Help p. 347: *"if you choose an anchor point
of Top Middle, the object may grow to the left, right, and down."*

`rotate` is an integer multiple of 90, default 0, on `field` and `draw`: **not
on `subform`**. Note that XFA rotation is counter-clockwise while CSS is
clockwise, so pdf.js emits `transform: rotate(-Ndeg)`.

### `w`/`h` against the min/max constraints

`w` and `h` are unset (empty string) when absent in pdf.js; PDFium defaults them
to `0in`. `minW`/`maxW`/`minH`/`maxH` default to 0, where **0 means "no
constraint"**. Resolution, from `computeBbox`:

```js
let width = node.w;
if (width === "") {
  if (node.maxW === 0) {
    width = parent.layout === "position" && parent.w !== "" ? 0 : node.minW;
  } else {
    width = Math.min(node.maxW, availableSpace.width);
  }
}
```

`<margin>`'s four values are named **`topInset`, `bottomInset`, `leftInset`,
`rightInset`**. They are insets, not CSS margins, despite pdf.js rendering them
as margins. `<para>` carries `hAlign`, `vAlign`, `lineHeight`, `marginLeft/Right`,
`spaceAbove/Below`, `tabDefault`, `textIndent`, `tabStops`, `orphans`, `widows`,
and inherits down the container tree via a stack.

## `<field>` against `<draw>`

Adobe, definitively: *"The **draw** object contains **non-interactive** form
design content… the text, static image, circle, line, and rectangle objects."*
against *"The **field** object describes a single **interactive** container
capable of capturing and presenting data content."*

The structural difference is which subtrees are legal:

| | `<field>` | `<draw>` |
| --- | --- | --- |
| `bind`, `calculate`, `validate`, `format` | yes | **no** |
| `access`, `accessKey` | yes | **no** |
| `items` (max 2) | yes | **no** |
| `event[]`, `connect[]`, `bindItems[]` | yes | **no** |
| `ui`, `value`, `caption`, `border`, `font`, `margin`, `para` | yes | yes |
| bindable | yes | no |
| geometry attributes | identical | identical |

**A `<draw>` still has a `<ui>` and a `<value>`.** The corpus bears this out:
`dd1610.pdf` has 73 `<draw>` against 51 `<field>`, and the `<draw>` elements
carry `<ui><textEdit/></ui>` exactly as fields do:

```xml
<draw h="4.2334mm" name="FormNumber_Date" w="65.088mm" y="266.7mm" x="6.35mm">
  <ui><textEdit><margin/></textEdit></ui>
  <value><text>DD FORM 1610, APR 2026</text></value>
  <font baselineShift="0pt" typeface="Arial" weight="bold"/>
  <margin bottomInset="0mm" leftInset="0.508mm" rightInset="1.27mm" topInset="0mm"/>
  <para marginLeft="0pt" marginRight="0pt" spaceAbove="0pt" spaceBelow="0pt" vAlign="bottom"/>
</draw>
```

The rule for a renderer: **a `draw` never produces a focusable widget and never
participates in data binding.** It is layout-participating decoration.

## `<exclGroup>`

Adobe: *"describes a **mutual exclusion relationship between a set of
containers**… used to cause a set of radio buttons to be mutually exclusive.
When a user activates one member of the set, the other members are automatically
deactivated."* And: *"**The on value for each member of a particular exclusion
group must be unique.**"*

It holds **`<field>` children directly** (no subform, no draw, no nesting) and
has **no `<occur>`**, so it cannot repeat. It does carry the full container
geometry set plus `layout`, so it lays its members out exactly as a subform does.

The renderer wires it off the **parent**, not the field. pdf.js
`CheckButton[$toHTML]`:

```js
const container = field[$getSubformParent]();
if (container instanceof ExclGroup) {
  groupId = container[$uid]; type = "radio";    className = "xfaRadio";
} else {
  type = "checkbox";                            className = "xfaCheckbox";
}
if (groupId) { input.attributes.name = groupId; }
```

**The same `<field><ui><checkButton/></ui></field>` renders as a checkbox outside
an exclGroup and a radio inside one**, with the group's UID as the HTML `name` to
enforce exclusivity. On/off values come from the field's first `<items>` list,
defaulting to the literal strings `"on"` and `"off"`.

## Scripts, events and validation

`<script>`'s `contentType` dispatch, verbatim from PDFium `cxfa_script.cpp`:

```cpp
if (!cData.has_value())                                    return Type::Formcalc;   // default
if (cData.value().EqualsASCII("application/x-formcalc"))   return Type::Formcalc;
if (cData.value().EqualsASCII("application/x-javascript")) return Type::Javascript;
return Type::Unknown;
```

**When `contentType` is absent the script is FormCalc.** Anything other than
those two exact strings is `Unknown` and is not executed.

The corpus is overwhelmingly JavaScript: **2,204 scripts with
`contentType="application/x-javascript"` against 38 with no attribute** (i.e.
FormCalc by default).

`<event>` takes one of `execute`, `script`, `signData`, `submit`, and an
`activity` attribute defaulting to `click`. Measured activity histogram across
the corpus, which is a fair picture of what federal forms actually hook:

```
change 247  exit 224  ready 153  click 132  enter 100  preSign 84
docReady 72  mouseDown 68  validationState 67  initialize 66
preSave/postSave/prePrint/postPrint/preSubmit/postSubmit/docClose 66 each
```

`<validate>` carries three test attributes with different defaults:
`formatTest` (default `warning`), `nullTest` (default `disabled`), `scriptTest`
(default `error`). **`nullTest="error"` is how "required field" is expressed**:
pdf.js maps it directly to the HTML `required` attribute and `aria-required`.

`<calculate>`'s `override` defaults to `error` in PDFium.

`<assist>` holds `speak` and `toolTip` and is pure accessibility metadata;
pdf.js derives ARIA labels and heading roles from it.

---

# 4. Encryption on federal forms

## What the corpus actually contains

Seventeen of 24 forms are encrypted. **Every one of them is the same
configuration**, and every one opens with an empty user password:

```
V=4  R=4  /Length 128  /CFM AESV2  /StmF /StdCF  /StrF /StdCF
```

```
$ qpdf --show-encryption dd1610.pdf
R = 4
P = -1052
User password =
Supplied password is user password
extract for accessibility: allowed
extract for any purpose: not allowed
print low resolution: allowed
print high resolution: allowed
modify document assembly: not allowed
modify forms: allowed
modify annotations: allowed
modify other: not allowed
stream encryption method: AESv2
```

All seventeen decrypt with `qpdf --decrypt` and no password supplied. Only four
distinct `/P` values occur across the whole corpus: **−1084** (8 forms), **−1052**
(7), **−1036** (1), **−3132** (1). That is 8 + 7 + 1 + 1 = 17.

## Handler revisions

ISO 32000-1:2008 clause 7.6.3.2, **Table 21**, verbatim:

> **R**: *(Required)* A number specifying which revision of the standard
> security handler shall be used… **2** if the document is encrypted with a V
> value less than 2 and does not have any of the access permissions set to 0
> that are designated "Security handlers of revision 3 or greater" in Table 22;
> **3** if the document is encrypted with a V value of 2 or 3, or has any
> "Security handlers of revision 3 or greater" access permissions set to 0;
> **4** if the document is encrypted with a V value of 4.

| R | V | Key | Algorithm | Introduced | `/O`, `/U` |
| --- | --- | --- | --- | --- | --- |
| 2 | 1 | 40-bit | RC4 | PDF 1.1 | 32-byte each |
| 3 | 2 or 3 | 40–128, from `/Length` | RC4 | PDF 1.4 | 32-byte each |
| **4** | **4** | **128-bit** | **RC4 (`/CFM /V2`) or AES-128-CBC (`/CFM /AESV2`)** | **PDF 1.5 / 1.6** | **32-byte each. This is what federal forms use.** |
| 5 | 5 | 256-bit | AES-256 | **Adobe Extension Level 3 (Acrobat 9). Deprecated, never in any ISO standard.** | 48-byte, plus `/OE`, `/UE`, `/Perms` |
| 6 | 5 | 256-bit | AES-256 | Adobe Extension Level 8 → ISO 32000-2:2020 | as R5, hardened hash (Algorithm 2.B) |
| 7 | 6 | 256-bit | AES-256-**GCM** | ISO/TS 32003:2023 | n/a |

`/V 5` and `R 5`/`R 6` are **not in ISO 32000-1**. qpdf's manual is the clearest
statement of R5's status:

> **R = 5**: V must be 5; **this extension was never fully specified and existed
> for a short time in some versions of Acrobat.** qpdf is able to read and write
> this format, but it should not be used for any purpose other than testing.
> **R = 6**: V must be 5. **This is the only value that is not deprecated in the
> PDF 2.0 specification.**

The R5/R6 fork is the *entire* algorithmic difference, visible in qpdf's
`hash_V5`: R5 returns the plain SHA-256; R6 runs Algorithm 2.B, an iterated
AES-128-CBC/SHA-256/384/512 loop. pdf.js implements the same split as
`revision === 6 ? new PDF20() : new PDF17()`.

For R ≤ 4 the key derivation is ISO 32000-1 **Algorithm 2**: pad the password to
32 bytes with the fixed padding string `28 BF 4E 5E … 53 69 7A`, MD5 over
(padded password ‖ `/O` ‖ `/P` as 32-bit LE ‖ `ID[0]` ‖ `FFFFFFFF` if metadata
is unencrypted), then for R ≥ 3 **50 further MD5 rounds**. `/O` is Algorithm 3,
`/U` is Algorithm 4 (R2) or 5 (R ≥ 3).

An important consequence of `/P` feeding step (d) of Algorithm 2, noted by qpdf:
*"The value of `P` is used by the algorithms to recover the encryption key given
the password, which makes the value of `P` tamper-resistant."* You cannot flip a
permission bit in place. You can, trivially, decrypt and re-emit without
`/Encrypt` at all.

## What the permissions wrapper actually is

Empty user password, non-empty owner password. Anyone opens it; a cooperating
reader applies `/P`.

ISO 32000-1 clause **7.6.3.1**, verbatim, and this is the sentence to cite:

> **Once the document has been opened and decrypted successfully, a conforming
> reader technically has access to the entire contents of the document. There is
> nothing inherent in PDF encryption that enforces the document permissions
> specified in the encryption dictionary. Conforming readers shall respect the
> intent of the document creator by restricting user access to an encrypted PDF
> file according to the permissions contained in the file.**

The obligation is on the reader, and the sentence before it concedes that
nothing enforces it. qpdf's manual states the cryptographic reason:

> Since the user password and the owner password are both used to recover the
> single encryption key, there is **fundamentally no way** to prevent an
> application from disregarding the security restrictions on a file. **Any
> software that can read the encrypted file at all has the encryption key.**

**Nobody in the open-source stack enforces `/P`:**

- **qpdf**: `QPDF.hh` carries the literal comment
  `// Encryption permissions -- not enforced by QPDF` above the whole
  `allow*()` family.
- **pdf.js**: `PermissionFlag` is never imported anywhere in `src/core/`
  outside `util.js`. Rendering and text extraction ignore `/P` entirely. The
  reference viewer's `enablePermissions` option defaults to `false`.
- **pikepdf** docs: *"**Either password removes the protection.** …Permissions
  are advisory flags that only cooperating viewers honour."*
- **MuPDF**: `mutool clean -D` has no permission gate.

## The `/P` bits

ISO 32000-1 clause 7.6.3.2, **Table 22** preamble, verbatim:

> The value of the P entry shall be interpreted as an **unsigned 32-bit
> quantity** containing a set of flags… **Bit positions within the flag word
> shall be numbered from 1 (low-order) to 32 (high-order).**
> **Conforming readers shall ignore all flags other than those at bit positions
> 3, 4, 5, 6, 9, 10, 11, and 12.**
> NOTE: …Since all the reserved high-order flag bits in the encryption
> dictionary's P value are required to be 1, **the integer value P shall be
> specified as a negative integer.**

| Bit | Value | R | Meaning |
| --- | --- | --- | --- |
| 1, 2 | 1, 2 | all | Reserved, **must be 0** |
| **3** | 4 | all | Print. At R ≥ 3, possibly at degraded quality depending on bit 12 |
| **4** | 8 | all | Modify contents, other than operations controlled by bits 6, 9, 11 |
| **5** | 16 | all | Copy or extract text and graphics. At R ≥ 3, other than bit 10 |
| **6** | 32 | all | Add or modify text annotations, fill in form fields, and **if bit 4 is also set**, create or modify form fields |
| 7, 8 | 64, 128 | all | Reserved, **must be 1** |
| **9** | 256 | R ≥ 3 | Fill in existing form fields, **even if bit 6 is clear** |
| **10** | 512 | R ≥ 3 | Extract for accessibility. **In PDF 2.0 this bit must be 1** |
| **11** | 1024 | R ≥ 3 | Assemble the document, **even if bit 4 is clear** |
| **12** | 2048 | R ≥ 3 | Print to a faithful digital copy. Clear + bit 3 set means degraded-quality printing only |
| 13–32 | | all | Reserved, **must be 1** (bit 13 is redefined by ISO/TS 32004 as "MAC token required") |

Three independent implementations agree on the values: qpdf's `allow*()` family
(1-based, `// Bits in P are numbered from 1 as in the PDF spec`), pdf.js's
`PermissionFlag` (`PRINT: 0x04` … `PRINT_HIGH_QUALITY: 0x800`), and MuPDF's
`PDF_PERM_*` (`1<<2` … `1<<11`).

Bit 10 is now effectively mandatory. qpdf: *"the specification now disallows
restriction of accessibility, and conforming readers are to treat this bit as if
it is set regardless of its value."* MuPDF's header: *"deprecated in pdf 2.0
(this permission is always granted)"*. Arlington encodes it as
`fn:SinceVersion(2.0, fn:BitSet(10))`. **[UNVERIFIED]** against ISO 32000-2's own
text, which was unreachable.

### The corpus values, decoded

Read `P & 0xFFFFFFFF` to recover the flags.

**−1052** (7 forms, all DD):
```
0xFFFFFBE4 = 1111 1111 1111 1111 1111 1011 1110 0100
bit  3 ✔ print        bit  4 ✘ modify      bit  5 ✘ extract
bit  6 ✔ annots+fill  bit  9 ✔ fill forms  bit 10 ✔ accessibility
bit 11 ✘ assemble     bit 12 ✔ high-res print
```

**−1084** (8 forms: the seven DAF other than `daf1297`, plus `sf15`): identical
**minus bit 6**, so no annotations.

**−3132** (`daf1297`): also clears bit 12, so low-resolution printing only.

**−3904**, the all-denied value, does not appear in the corpus and would be
illegal under PDF 2.0 since it clears bit 10:
```
−4 − (4+8+16+32+256+512+1024+2048) = −3904
```

The spec's own worked example, for calibration: **−44** at R2 *"permits printing
and copying but disallows modifying the contents and annotations"*.
`0xFFFFFFD4`: bits 3 and 5 set, 4 and 6 clear. ✔

## `/EncryptMetadata`

ISO 32000-1 Table 21: *"(Optional; meaningful only when the value of V is 4;
PDF 1.5)… **Conforming products should respect this value.** Default value:
true."*

It is not cosmetic. It feeds the key derivation. Algorithm 2 step (f): *"(R 4
or greater) If document metadata is not being encrypted, pass **4 bytes with the
value 0xFFFFFFFF** to the MD5 hash function."* Flipping it changes the file key.

**No corpus form carries it**, so all default to true and their XMP is
encrypted. The intended mechanism for plaintext metadata is the **Identity crypt
filter**, not this flag alone.

## `/Perms /UR3` and Reader Extensions

**21 of 24 corpus forms carry one.** ISO 32000-1 clause **12.8.4**, verbatim:

> **UR3**: *(Optional)* A signature dictionary that shall be used to specify and
> validate additional capabilities (usage rights) granted for this document;
> that is, **the enabling of interactive features of the conforming reader that
> are not available by default. For example, a conforming reader does not permit
> saving documents by default, but an agent may grant permissions that enable
> saving specific documents.**

and on the permissions dictionary generally: *"These permissions are similar to
those defined by security handlers but do not require that the document be
encrypted. For a permission to be actually granted for a document, it shall be
allowed by each permission handler that is present in the permissions dictionary
**as well as by the security handler.**"*

Note the table numbering, because it is easy to get wrong. In ISO 32000-1:
**Table 252** signature dictionary, **Table 253** signature reference dictionary,
**Table 254** DocMDP transform parameters, **Table 255** UR transform parameters,
**Table 258** permissions dictionary (clause 12.8.4). In ISO 32000-2:2020 the
permissions dictionary moves to **clause 12.8.6, Table 263**, and UR transform
parameters become **Table 258**.

Clause 12.8.1 also caps it: *"**At most two usage rights signatures (PDF
1.5)**… referenced from the UR3 entry in the permissions dictionary **(not from
a signature field)**."*

### What one looks like

Verbatim from `dd1610.pdf`:

```
/Perms << /UR3 << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached
  /Name (ARE Production V8.1 G3 P24 1007657)
  /M (D:20260707131249-04'00')
  /ByteRange [0 1256 13706 74618]
  /Reference [ << /Type /SigRef /Data 1 0 R /TransformMethod /UR3
      /TransformParams << /Type /TransformParams /V /2.2
        /Annots [/Create /Delete /Modify /Copy /Import /Export]
        /Document [/FullSave]
        /Form [/Add /FillIn /Delete /SubmitStandalone]
        /Signature [/Modify] >> >> ] >> >>
```

`ARE` is Adobe Reader Extensions. The certificate chain resolves to
`Adobe Product Services G3` → `Adobe Root CA G2` and carries Adobe's usage-rights
OID **1.2.840.113583.1.1.7.1**.

ExifTool decodes the rights into readable form, which is the fastest way to read
one:

```
$ exiftool -a -G1 dd1610.pdf
[PDF]  Signing Authority          : ARE Production V8.1 G3 P24 1007657
[PDF]  Annotation Usage Rights    : Create, Delete, Modify, Copy, Import, Export
[PDF]  Document Usage Rights      : FullSave
[PDF]  Form Usage Rights          : Add, FillIn, Delete, SubmitStandalone
[PDF]  Signature Usage Rights     : Modify
```

**Table 255**, the transform parameters, in full:

| Key | Values |
| --- | --- |
| `Document` | `FullSave`, *"permits a user to save the document along with modified form and/or annotation data"* |
| `Annots` | `Create`, `Delete`, `Modify`, `Copy`, `Import`, `Export`; PDF 1.6 adds `Online`, `SummaryView` |
| `Form` | `Add`, `Delete`, `FillIn`, `Import`, `Export`, `SubmitStandalone`, `SpawnTemplate`; PDF 1.6 adds `BarcodePlaintext`, `Online` |
| `Signature` | `Modify`, *"permits a user to apply a digital signature to an existing signature form field or clear a signed signature form field"* |
| `EF` | `Create`, `Delete`, `Modify`, `Import`, named embedded files |
| `V` | **name**, not a number. *"The value shall be 2.2. **If an unknown version is present, no rights shall be enabled.**"* |
| `Msg` | Arbitrary text, e.g. the reason rights were added |
| `P` | boolean, PDF 1.6 |

Adobe's own description, from
`https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsdevguide/JS_Dev_Ubiquity.html`
("Rights-Enabled PDF Files", updated 2 May 2023):

> **LiveCycle Reader Extensions sets permissions within a PDF document that
> would otherwise be disabled through the usage of a certificate issued by the
> Acrobat Reader Extension Root Certificate Authority.** Permissions… are
> determined by the combination of the user rights settings in the PDF file and
> a special Object Identifier (OID), embedded within the certificate.

## What breaks a UR3 signature

Validation is two steps. ISO 32000-1 clause **12.8.2.3**, verbatim:

> **First, a conforming reader shall verify the byte range digest to determine
> whether the portion of the document specified by ByteRange corresponds to the
> state of the document at the time of signing. Next, a conforming reader shall
> examine the current version of the document to see whether there have been
> modifications to any objects that are not permitted by the transform
> parameters.**

**On real federal forms the `/ByteRange` covers the entire file** except the
signature's own `/Contents` hex string. Verified across the corpus:

```
dd1610.pdf  size 88324   ByteRange [0, 1256, 13706, 74618]   13706+74618 = 88324 = EOF  ✓
```

So **any single byte changed anywhere breaks the digest.** There is no harmless
rewrite. Demonstrated:

```
$ qpdf --decrypt dd1610.pdf t1.pdf
$ # ByteRange is unchanged at [0, 1256, 13706, 74618]; the file is now 81256 bytes
$ #   13706 + 74618 = 88324 != 81256  ->  the signature no longer covers the file
$ python3 -c "import re; print('/UR3 present:', bool(re.search(rb'/UR3', open('t1.pdf','rb').read())))"
/UR3 present: True
```

**This is the dangerous failure mode.** qpdf leaves a *corpse*: the `/UR3`
dictionary survives, so a tool that tests for its presence concludes the rights
are intact, while Acrobat validates the `ByteRange`, fails, and drops them.
Ghostscript is at least honest: `gs -sDEVICE=pdfwrite` removes `/Perms`
entirely.

| Operation | `/UR3` after | Digest valid |
| --- | --- | --- |
| `qpdf --decrypt` | present, stale | **no** |
| `qpdf --qdf --object-streams=disable` | present, stale | **no** |
| `qpdf --linearize --decrypt` | present, stale | **no** |
| `gs -sDEVICE=pdfwrite` | **removed** | n/a |
| `qpdf --remove-restrictions` | removed by design | n/a |

Why every rewrite does it: **qpdf has no incremental-update support at all.**
From its `TODO.md`: *"Support incremental updates… Support digital signatures.
This probably requires support for incremental updates."* Ghostscript cannot
preserve anything by design: *"a new PDF file is being created"*, and its
`-dPreserveAnnots` explicitly excludes `/Widget` annotations, which is what a
signature field is.

The one mode that survives is a true incremental append, where the original file
is a byte-exact prefix of the output. MuPDF's write options expose it
(`incremental`). Even then, step (b) of 12.8.2.3 still applies: adding a field
when `/Form` lacks `/Add`, or touching `/NeedAppearances`, violates the transform
parameters with the prefix intact.

pikepdf states the practical conclusion plainly:

> Many XFA forms are *Reader-enabled*: Adobe signs a usage-rights/Reader-Extensions
> block with a private key so that Adobe Reader unlocks features (such as saving
> filled data) that are otherwise disabled. **Third-party software cannot
> reproduce or honor those signatures, and any edit invalidates them.**

### The banner wording

The positive banner is attested: **"This document enabled extended features in
Adobe Acrobat Reader."** (quoted in Apache PDFBox JIRA PDFBOX-5521 as the
indicator that a usage-rights signature is present).

The invalid-state wording is commonly rendered as *"…The document has been
changed since it was created and use of extended features is no longer
available."* **[UNVERIFIED against Adobe primary.]** `helpx.adobe.com` timed
out on every attempt and Adobe's own doc search returns no hits for "UR3" or
"usage rights".

## `/Root /Extensions`

ISO 32000-1 clause **7.12**. **Table 50**: `BaseVersion` (required name),
`ExtensionLevel` (required integer), `Type` (optional). The dictionary and all
its entries **shall be direct objects**.

```
/Extensions << /ADBE << /BaseVersion /1.7 /ExtensionLevel 8 >> >>
```

`ExtensionLevel 3` is the Acrobat 9 supplement (AES-256/R5); `ExtensionLevel 8`
is the Acrobat X supplement carrying R6, which became PDF 2.0. **One corpus form
carries it**: `daf1297.pdf`, with `/ExtensionLevel 8`, and it is the same form
whose config packet declares `<adobeExtensionLevel>8</adobeExtensionLevel>`. The
rest are plain PDF 1.7 asserting no extension level.

## PDF/A forbids all of it

`/Encrypt` is prohibited in every part, at clause **6.1.3 "File trailer"**.
veraPDF rule IDs: **ISO 19005-1 6.1.3-2**, **ISO 19005-2 6.1.3-2**, **ISO 19005-4
6.1.3-2**: *"The Encrypt key shall not be present in the trailer dictionary"*.

The `/UR3` story has a sharp version change:

- **PDF/A-2 and -3 permitted it.** veraPDF `ISO_19005_2` clause 6.1.12 test 1:
  *"No keys other than UR3 and DocMDP shall be present in a permissions
  dictionary."*
- **PDF/A-4 dropped it.** `ISO_19005_4` clause 6.1.11 test 1: *"No key other
  than **DocMDP** shall be present in a permissions dictionary (ISO
  32000-2:2020, 12.8.6, Table 263)."*

So a PDF/A-4 file may carry `/DocMDP`; a `/UR3` entry is a validation failure.
This is independent confirmation of both the PDF 2.0 renumbering and the UR3
deprecation.

Conversely PDF/UA-1 *allows* encryption but requires **bit 10 set**: veraPDF
`ISO_14289_1` clause 7.16 test 1, `P != null && (P & 512) == 512`.

## What the publishers say

**DoD publishes a Reader Extensions statement.** `esd.whs.mil/Directives/faq/`,
verbatim:

> **Q05. Are Adobe Reader Extensions available for all Department of Defense
> Forms available in PDF forms?** *"**Yes, all Department of Defense Forms
> available in PDF format have been Reader Extensions with the exception of
> non-fillable forms.**"*

and every DD form index page carries, added between the 2026-02-01 and
2026-02-17 Wayback snapshots:

> *"To ensure full functionality and avoid issues, please download the desired
> form to your computer. Then, open the downloaded file using Adobe Acrobat
> Reader. **Note: Some forms may not display or function correctly when opened
> directly in a web browser.**"*

That is a precise description of the XFA failure mode, written without ever
saying XFA.

**The Air Force publishes nothing.** No mention of Adobe, Acrobat, Reader, XFA,
LiveCycle, encryption or usage rights on the homepage, FAQ, product index or
about pages. Its governing publication does address production.
**DAFMAN 90-161**, 18 Oct 2023, ¶8.6: *"PFMs and form developers will use the
USAF centrally procured Adobe LiveCycle Designer® software to develop forms.
(T-1)"*. It never names the Reader-Extending step.

**Neither agency states, on any page reached here, that the PDFs are encrypted
or carry a permissions dictionary.** The DoD framing is a convenience ("so free Reader can
fill them"), never a restriction.

---

# 5. Forensic technique

## `qpdf --qdf`

QDF is *"a completely valid PDF file that has `%QDF-1.0` as its third line"*.
Streams are uncompressed, content normalized, objects in numerical order, one
token per line, and **every object is preceded by a comment naming its original
object number**.

```bash
qpdf --qdf --object-streams=disable in.pdf readable.pdf
```

The comment vocabulary, from a real run:

```
1:%PDF-1.7
3:%QDF-1.0
5:%% Original object ID: 1 0
69:%% Page 1
117:%% Contents for page 1
52:%QDF: ignore_newline
```

`--object-streams=disable` is what makes `grep` work. Without it, objects stay
inside `/ObjStm` containers and QDF only renumbers them n+1…n+k with
`%% Object stream: object N, index I; original object ID: X` comments.

**QDF and linearization are mutually exclusive**: *"If you enable linearization,
QDF mode is automatically disabled."*

**`fix-qdf` exists because stream lengths are indirect objects placed
immediately after their stream.** Any hand edit that changes a byte count
invalidates the length object, the xref offsets and `startxref` at once:

```
$ qpdf --check edited.pdf
WARNING: file is damaged
WARNING: xref not found ... attempting to reconstruct
$ fix-qdf edited.pdf > fixed.pdf
$ qpdf --check fixed.pdf
No syntax or stream encoding errors found
```

## `qpdf --json`

v2 (qpdf 11+) is the one to use: it adds `"u:"` / `"b:"` string prefixes,
canonical name forms, and stream data. Every object is wrapped in `{"value": …}`
or `{"stream": …}`, keyed as `"obj:N G R"`, plus a reserved `"trailer"` key.

```bash
qpdf --json=latest --json-key=qpdf --json-stream-data=none form.pdf > objects.json
qpdf --json=latest --json-key=qpdf --json-object="7 0 R" --json-stream-data=inline form.pdf
qpdf --json=latest --json-stream-data=file --json-stream-prefix=STREAM form.pdf
```

Real shape, from `dd1610.pdf`:

```json
{ "version": 2,
  "parameters": { "decodelevel": "generalized" },
  "qpdf": [ { "jsonversion": 2, "pdfversion": "1.7", "maxobjectid": 723 },
            { "obj:1 0 R": { "value": { "/Contents": "2 0 R",
                                        "/MediaBox": [0.0, 0.0, 612.0, 792.0] } } } ] }
```

`--json-stream-data` is `none` | `inline` (base64) | `file`. Note `/Length` is
stripped from the JSON stream dict; it is regenerated on output.

**Gotcha:** `--json-object=` filters only the `"qpdf"` objects array. The other
top-level keys (`pages`, `acroform`, `attachments`, `encrypt`, `outlines`) are
still emitted in full. Pair it with `--json-key=qpdf`.

The other inspection flags, with their exact output forms:

```
$ qpdf --show-xref f.pdf
1/0: uncompressed; offset = 766
2/0: compressed; stream = 8, index = 5

$ qpdf --show-object=7 --filtered-stream-data f.pdf   # decoded
$ qpdf --show-object=7 --raw-stream-data f.pdf        # as stored
$ qpdf --show-npages f.pdf
$ qpdf --list-attachments --verbose f.pdf             # incl. MD5 per stream
$ qpdf --check f.pdf                                  # 0 ok, 2 errors, 3 warnings
```

## Object streams and cross-reference streams

ISO 32000-1 clause **7.5.7** (`/Type /ObjStm`, Table 16) and **7.5.8**
(`/Type /XRef`, Tables 17 and 18).

An ObjStm's `/N` is the object count and `/First` the byte offset where object
data begins; the first `/First` bytes are `2 × /N` integers, alternating object
number and relative offset. Real example:

```
$ qpdf --show-object=8 f.pdf
<< /Filter /FlateDecode /First 31 /Length 179 /N 6 /Type /ObjStm >>
$ qpdf --show-object=8 --filtered-stream-data f.pdf
6 0 9 3 12 17 13 20 7 34 2 100 97
<</R7 7 0 R>>
```

Twelve integers = six pairs. Object 6 is at relative offset 0.

Constraints that matter: contained objects must be generation 0, **stream
objects may not live in an object stream**, and **objects inside an ObjStm are
not encrypted individually**. The ObjStm is the encrypted unit, so decrypting
one dumps every object it holds.

An XRef stream's `/W` gives the byte widths of three fields:

| Type | Field 2 | Field 3 |
| --- | --- | --- |
| **0** free | next free object number | generation to use if reused |
| **1** uncompressed | **byte offset** | generation |
| **2** in an object stream | **containing ObjStm object number** | **index within it** |

A `/W` entry of 0 means the field is absent and takes its default; type defaults
to 1 when `W[0] == 0`.

The real one from `dd1610.pdf`:

```
<< /Columns 5 /Predictor 12 >> /Filter /FlateDecode /Length 724
   /Root 1 0 R /Size 814 /Type /XRef /W [1 3 1] >>
```

**A raw zlib inflate is not enough.** `/Predictor 12` is the PNG "Up" filter.
After inflating you get `Columns+1` bytes per row: **one leading filter-type
byte**, then `Columns` data bytes, and the data bytes are *deltas*. Undo it row
by row (`data[j] += prev_row[j] mod 256`) before slicing by `/W`. A naive
`zlib.decompress()` gives you `02 00 00 00 00 02 01 00 0f 00 …` and you conclude
the file is corrupt.

`qpdf --show-object=N --filtered-stream-data` applies the predictor;
`--raw-stream-data` does not. QDF mode writes xref streams unfiltered.

## Incremental updates, and the trap in counting them

An update appends a body, a new xref covering only changed objects, a trailer
with `/Prev` pointing at the previous xref offset, then `startxref` and `%%EOF`.
Nothing before the first `%%EOF` is touched. That non-modification is the whole
forensic story: superseded objects stay byte-present, so prior document states,
failed redactions, earlier form data and prior signatures all survive.

**Counting `%%EOF` markers does not count revisions.** Measured across the
corpus:

```
FILE           EOFs  Linearized  Actual revisions
daf1206.pdf    1     no          1
dd1610.pdf     2     YES         1
sf2809.pdf     2     YES         1
```

Eleven corpus forms have two `%%EOF` markers and **none of them has an
incremental update**. Every one is *linearized*: the first-page xref at the front
of the file ends with its own `%%EOF`, and its `/Prev` points forward. All 24
forms are single-revision.

So enumerate generations three ways and reconcile:

```bash
# (a) locate the markers, but treat the count as an upper bound
python3 -c "import re;d=open('f.pdf','rb').read();print([m.start() for m in re.finditer(rb'%%EOF',d)])"

# (b) check for linearization before believing the count
head -c 2000 f.pdf | grep -c /Linearized

# (c) let Ghostscript walk the /Prev chain and print every trailer
gs -dNODISPLAY -dBATCH -dNOPAUSE -dPDFDEBUG -q f.pdf 2>&1 | grep -E "Prev|Reading xref|trailer"
```

`-dPDFDEBUG` is the fastest generation enumerator available: it prints every
trailer in the chain in order, then the merged xref, then the resolved
Root/Info/Pages.

`qpdf --show-xref` shows only the **resolved** xref, the newest binding per
object, so it cannot enumerate generations. Use it afterwards, to diff which
object numbers each generation rebinds.

**Hybrid-reference files** are the related trap: a classic `xref` table plus
`/XRefStm <offset>` pointing at a cross-reference stream, so PDF 1.4 readers see
a smaller consistent document and 1.5+ readers see everything. The correct
traversal is to read `/XRefStm` **for entries only** and discard its trailer and
its `/Prev`. MuPDF's comment: *"Read the XRefStm stream, but throw away the
resulting trailer. We do not follow any Prev tag therein, as specified on Page
108 of the PDF reference 1.7."* ExifTool warns of the precedence hazard: *"this
technique can potentially result in an old object being used if the file was
incrementally updated and an older object from an xref table was replaced by a
newer object in an xref stream."*

## `strings`, `binwalk`, `exiftool`

**`strings`** reaches the uncompressed strata only: object dictionaries, the
`stream`/`endobj` keywords, and, usefully, the **entire XMP packet**, since XMP
is conventionally left uncompressed. Grep for the fixed XMP magic
`W5M0MpCehiHzreSzNTczkc9d` to locate every XMP block including superseded ones.
Note that PDF **key names are never encrypted**, only strings and streams, so
`/NeedsRendering` and `/UR3` are greppable even in an encrypted file while the
XFA packet names are not.

**`binwalk`** on a PDF reports the header magic and little else. v3 does not
flag raw zlib by default, so the dozens of FlateDecode streams are invisible.
It earns its place only for embedded whole files. Use `qpdf --json-key=pages`
or `mutool extract` for images.

**`exiftool` needs two flags for forensic work: `-m -a -G1`.** Both are
load-bearing and both are non-obvious.

Without `-a`, the PDF `/Info` table's `PRIORITY => 0` means **XMP values shadow
the `/Info` dictionary**, so you silently read a stale answer. Without `-m`,
prior-revision `/Info` dictionaries are dropped with a *minor* warning
(`Ignored duplicate Info dictionary`), which `-m` defeats.

```
$ exiftool -m -a -G1 dd1610.pdf
[PDF]  PDF Version                : 1.7
[PDF]  Linearized                 : Yes
[PDF]  Encryption                 : Standard V4.4 (128-bit)
[PDF]  User Access                : Print, Annotate, Fill forms, Extract, Print high-res
[PDF]  Creator                    : Designer 6.5
[PDF]  Producer                   : Designer 6.5
[PDF]  Has XFA                    : Yes
[PDF]  Tagged PDF                 : Yes
[PDF]  Signing Authority          : ARE Production V8.1 G3 P24 1007657
[PDF]  Document Usage Rights      : FullSave
[XMP-xmpMM] Document ID           : uuid:4c043ff3-3be1-4856-8bea-0942702e38ff
```

`[PDF] Producer` appearing twice is the visible signature of an incremental
update. One documented blind spot, from ExifTool's own source: *"can't capture
previous versions of Root since they are not parsed."*

## Decompressing a content stream by hand

```bash
python3 -c "
import re, zlib
d = open('form.pdf','rb').read()
for m in re.finditer(rb'stream\r?\n', d):
    s = m.end(); e = d.find(b'endstream', s)
    try: out = zlib.decompress(d[s:e])
    except Exception: continue
    print(out[:400].decode('latin1'))
"
```

Prefer `zlib.decompressobj().decompress(...)` so truncated streams and wrong
`/Length` values still yield partial output. Tool equivalents:

```bash
qpdf --show-object=7 --filtered-stream-data f.pdf
qpdf --qdf --object-streams=disable f.pdf out.pdf
mutool clean -dtt f.pdf out.pdf        # decompress + indented syntax, no GC
gs -q -dNODISPLAY -dBATCH -dNOPAUSE -dPDFDEBUG f.pdf
```

**Never run `mutool clean -g*` or `gs -sDEVICE=pdfwrite` on evidence.** Garbage
collection deletes exactly the orphaned objects an investigation is looking for,
and pdfwrite re-distills rather than dissects, destroying object numbering and
every prior generation.

`mutool show -L f.pdf grep` is the one capability qpdf lacks: **object
reachability labels**, telling you how an object is reached from the Catalog,
which is how you tell a live object from an orphan.

## Censusing operators

Tokenize per ISO 32000-1 clause 7.2, **skip inline images** (on `BI`, jump past
the next `EI`, or the binary poisons the histogram), and count bare keyword
tokens against the operator set.

Two invariants for a sanity check: **`BT` must equal `ET`, and `q` must equal
`Q`.** Any file where they do not is damaged or hand-crafted.

Real census, all page content streams of `dd1610.pdf` (static XFA), 3,406
operator tokens:

```
EMC 305   BDC 291   m 287   l 287   q 244   Q 244   S 236
cm 211    Tj 206    Tm 120  BT 109  ET 109  re 104  Tf 68
Td 65     f 48      w 45    rg 41   s 38    g 33    W 32
BMC 14    Do 1
```

**Marked content outnumbers text.** 291 `BDC` and 305 `EMC` against 206 `Tj`.
That is the signature of a LiveCycle form: the tagging is what makes these
streams long without adding marks. Broken down by tag:

```
Artifact 142   Content 139   Caption 28   /ActualText 0
```

For contrast, a dynamic XFA form's whole document is **33 operators in 960
bytes**, because the only page is the placeholder. An operator census on a
dynamic form tells you nothing about the form; census the `template` and
`datasets` XML instead. **That is how an operator census misleads an analyst on a
government form.**

Producer fingerprints worth knowing, from measured histograms:

- **`Td`/`TD`-dominant** means the producer laid text out in a flow.
  **`Tm`-dominant** means each fragment was absolutely positioned: an OCR layer
  or a re-typeset scan. Acrobat Paper Capture is unmistakable: `Tj`:`Td`:`Tm` ≈
  2:1.2:1 with heavy `W*` clipping.
- **`BDC`/`EMC` in exact pairs** signals tagged/structured PDF.
- **`cs`/`scn` instead of `g`/`rg`/`k`** means an explicit `/ColorSpace`
  resource, a modern-toolchain marker.

## Published work worth citing

**Didier Stevens' tools** (`https://blog.didierstevens.com/programs/pdf-tools/`):

- **`pdfid.py`**: keyword counting, no parsing. Default list includes `/JS`,
  `/JavaScript`, `/AA`, `/OpenAction`, `/AcroForm`, `/EmbeddedFile`, `/XFA`. Its
  `(n)` suffix counts **hex-obfuscated** occurrences (`/JBIG#32Decode`).
  `xref`/`trailer`/`startxref` counts > 1 hint at incremental updates.
- **`pdf-parser.py`**: `-o`/`-r` are "(version independent)", which is precisely
  what reaches superseded objects across updates; `-O/--objstm` reaches objects
  inside ObjStms without a working xref.
- **`pdftool.py iu`**: *"checks for version history and extracts specific
  versions"*. The purpose-built tool for prior-revision recovery.

**Projects**: [peepdf](https://github.com/jesparza/peepdf) (changelog and
old-version extraction; dormant, verify against qpdf),
[pdfcpu](https://github.com/pdfcpu/pdfcpu) (Go, PDF 2.0, signature evidence
reporting), and the
[Arlington PDF Model](https://github.com/pdf-association/arlington-pdf-model),
the best free substitute for the paywalled ISO text, maintained by the PDF
Association, with ISO table numbers in its `Note` column.

**Academic** (arXiv, all verified 2026-09-03): Maiorca & Biggio, *Digital
Investigation of PDF Files: Unveiling Traces of Embedded Malware*,
[1707.05102](https://arxiv.org/abs/1707.05102); Maiorca, Biggio & Giacinto,
[1811.00830](https://arxiv.org/abs/1811.00830); Ehteshamifar et al., *Easy to
Fool? Testing the Anti-evasion Capabilities of PDF Malware Scanners*,
[1901.05674](https://arxiv.org/abs/1901.05674); Liu et al., *Analyzing PDFs like
Binaries*, [2506.17162](https://arxiv.org/abs/2506.17162).

**[UNVERIFIED]**: **dfrws.org returned HTTP 403** to every request. There are no
DFRWS citations here, and no claim that DFRWS has published on PDF structural
forensics should be inferred from this document.

## A dissection sequence

Ordered so nothing destructive runs before the evidence is captured.

```bash
shasum -a 256 evidence.pdf

# triage without parsing
pdfid.py -e evidence.pdf
python3 -c "import re;d=open('evidence.pdf','rb').read();print([m.start() for m in re.finditer(rb'%%EOF',d)])"
head -c 2000 evidence.pdf | grep -c /Linearized        # before believing the count

# enumerate revisions: prints EVERY trailer in the /Prev chain
gs -dNODISPLAY -dBATCH -dNOPAUSE -dPDFDEBUG -q evidence.pdf 2>&1 | tee gs-debug.txt

# metadata, prior revisions included; BOTH -m and -a are required
exiftool -m -a -G1 evidence.pdf

# structure
qpdf --check evidence.pdf
qpdf --show-encryption evidence.pdf
qpdf --show-xref evidence.pdf
qpdf --json=latest --json-key=qpdf --json-stream-data=none evidence.pdf > objects.json

# readable copy, original object IDs preserved as comments
qpdf --qdf --object-streams=disable --decrypt evidence.pdf evidence.qdf.pdf
grep -a "^%%" evidence.qdf.pdf

# content level
qpdf --show-object=N --filtered-stream-data evidence.pdf
gs -q -dNODISPLAY -dBATCH -dNOPAUSE -sDEVICE=txtwrite -o text.txt evidence.pdf
```

For this corpus specifically, `node scripts/characterize-forms.mjs demo/samples/corpus/*.pdf`
prints the classification of any of them.

---

# 6. Content-stream constructs that trip naive renderers

Spec citations are ISO 32000-1:2008 clause and table numbers, read from the
Adobe-hosted copy. Corpus measurements follow each.

## Marked content and tagged PDF

Clause **14.6.1**. `MP`/`DP` mark a point; `BMC`/`BDC`/`EMC` bracket a sequence.
`BDC` and `DP` take *"either an inline dictionary containing the property list or
a name object associated with it in the `Properties` subdictionary."*

The nesting rule naive stack parsers violate: `BMC…EMC`, `BDC…EMC` and `BT…ET`
must be **separately** nested. `BMC BT … EMC BT` is explicitly invalid. Marked
content *"may appear only between graphics objects… not within a graphics object
or between a graphics state operator and its operands."*

`/StructParent` against `/StructParents` (Table 326, clause 14.7.4.4) is the
distinction most implementations get wrong. Verbatim: *"**At most one of these
two entries shall be present in a given object.** An object may be either a
content item in its entirety or a container for marked-content sequences that
are content items, but not both."* For a content stream, the parent-tree value
is an **array indexed by MCID**.

**`/ActualText` is a replacement, not a description.** Clause 14.9.4: *"The
`ActualText` value shall be used as a replacement, not a description, for the
content… If each of two (or more) consecutive structure or marked-content
sequences has an `ActualText` entry, they shall be treated as if no word break
is present between them."* The spec's own example:

```
(Dru) Tj  /Span <</ActualText (c) >> BDC  (k-) Tj  EMC  (ker) '
```

Correct extraction is `Drucker`. Naive extraction is `Druk-ker`. `/Alt` is
different: a whole-word substitution, not a character one (14.9.4 NOTE 2).

**`/Artifact`** (14.8.2.2.2) marks *"content generated by the conforming writer
in the course of pagination, layout, or other strictly mechanical processes"*:
running heads, folios, rules, table decoration. Table 330 property keys:
`/Type` (`Pagination`, `Layout`, `Page`, `Background`), `/BBox`, `/Attached`,
`/Subtype` (`Header`, `Footer`, `Watermark`).

**Measured engine behaviour**, on a file containing the spec's own ActualText
example plus a tagged footer artifact:

| Engine | `/ActualText` honored | `/Artifact` excluded |
| --- | --- | --- |
| poppler `pdftotext` 26.08.0 | **yes** → `Drucker` | **no** |
| Ghostscript 10.07.1 `txtwrite` | **no** → `Druk-ker` | **no** |
| pdf.js `getTextContent()` | **no** | **no** |

Ghostscript returns the *wrong characters*, not merely extra ones. pdf.js is the
weakest: marked content is behind `includeMarkedContent`, which defaults to
`false`, and even enabled it emits only the tag and MCID.
`grep -rn ActualText src/core/` returns nothing outside the structure-tree
serializer, and there is no `/Artifact` handling in `evaluator.js` at all.

## Optional content

Clause **8.11**. Inline form is `BDC` with tag `OC` and a property list that
**must be a named resource**: *"Because a group shall be an indirect object…
the property list shall be a named resource listed in the `Properties`
subdictionary."*

Two normative traps. Tag collision: *"The marked content shall be considered to
be for optional content **only if** the tag is `OC` and the dictionary operand is
a valid optional content group or membership dictionary."* And nesting: *"if the
settings that apply to the outer level indicate that the content should be
hidden, the inner level is hidden regardless of its settings."*

For XObjects, Table 95's `/OC` row is unambiguous about renderer duty: *"If it is
determined to be invisible, **the entire form shall be skipped, as if there were
no `Do` operator to invoke it.**"*

The catalog carries the state, and this is what extractors miss: *"This
dictionary shall be present if the file contains any optional content; **if it
is missing, a conforming reader shall ignore any optional content
structures.**"* `/D`'s `/BaseState` (default `ON`) is applied first, then `/ON`,
then `/OFF`.

**Three corpus forms carry OCGs, and two of them default to hidden:**

```
dd1750.pdf, sf15.pdf:
  /OCProperties << /D << /AS [ … /Event /Print … /Event /View … ]
                        /BaseState /OFF /ON [ 7 0 R ] /Order [ ] >> … >>
  OCG names: (PrintOnly Layer), (ViewOnly Layer)
  /Usage << /CreatorInfo << /Creator (AcroForm) /Subtype (Artwork) …
sf2809.pdf:
  OCG names: (Headers/Footers), /Usage << /PageElement << /Subtype /HF …
```

`/BaseState /OFF` with a single group in `/ON`, plus `/AS` auto-state switching
by `Print` vs `View` event. **A text extractor that walks `BDC`/`EMC` blind pulls
both layers**, including the one that only exists for printing. Nothing in the
operator stream marks it hidden; the state lives in the catalog.

## Form XObjects and appearance streams

Clause **8.10**, Table 95. `/BBox` required: *"used to clip the form XObject and
to determine its size for caching"*. `/Matrix` optional, identity default.

**The resource-inheritance quirk**, verbatim and worth quoting because it is the
actual trap:

> In PDF 1.2 and later versions, form XObjects may be independent of the content
> streams in which they appear, and this is **strongly recommended although not
> required**. In an independent form XObject, the resource dictionary of the form
> XObject is required and shall contain all named resources used by the form
> XObject.

"Strongly recommended although not required" means a conforming reader **must
still fall back to the page's resource dictionary** when a form XObject omits
`/Resources` or omits a name it references. Type 3 fonts have the identical rule
(Table 112). Implementations without a resource-dictionary stack silently drop
fonts and images.

Clause 8.10.1 confirms the "page is one `Do`" pattern is intended: *"a program
that prints filled-in tax forms can first paint the fixed template as a form
XObject and then paint the variable information on top of it."*

**Appearance streams** (12.5.5) are form XObjects, and the mapping is a
normative three-step algorithm: transform `/BBox` by `/Matrix`, take the smallest
upright bounding rectangle, compute the matrix mapping its corners onto `/Rect`,
then `AA = Matrix × A`. Renderers that simply translate to `/Rect` misplace
widgets.

**The checkbox on-state name is not always `/Yes`.** Clause 12.7.4.2.3, verbatim:
*"The appearance for the off state is optional but, if present, **shall** be
stored in the appearance dictionary under the name `Off`. `Yes` **should** be
used as the name for the on state."* `shall` for `Off`, `should` for `Yes`. So
the on-state name is arbitrary in conforming files. The spec then contradicts its
own recommendation: clause 12.5.5's EXAMPLE uses `/On`. **Enumerate the keys of
`/AP /N` and take the single non-`/Off` key**, cross-checked against `/AS`.

## Non-embedded base-14 fonts

Clause **9.6.2.2** names the 14 (Times-Roman/Bold/Italic/BoldItalic,
Helvetica/-Bold/-Oblique/-BoldOblique, Courier/-Bold/-Oblique/-BoldOblique,
Symbol, ZapfDingbats) and states the duty: *"These fonts, **or their font
metrics and suitable substitution fonts, shall be available to the conforming
reader.**"* Symbol and ZapfDingbats *"have built-in encodings that are unique to
each font"*, and for ZapfDingbats the glyph names *"are meaningless"*.

`/Flags` bit values (Table 123): FixedPitch 1, Serif 2, Symbolic 4, Script 8,
Nonsymbolic 32, Italic 64, AllCap 65536, SmallCap 131072, ForceBold 262144.

**What each engine substitutes**, and the answers differ enough to matter:

- **pdf.js** bundles real fonts and maps by name: Helvetica family →
  LiberationSans, Times/Courier/Symbol/Dingbats → Foxit `.pfb`. They are fetched
  at runtime from `standardFontDataUrl`; **if the integrator does not host that
  directory, base-14 substitution silently fails.**
- **Ghostscript** aliases to the URW++ clones in `Resource/Init/Fontmap.GS`:
  Helvetica→NimbusSans, Times-Roman→NimbusRoman, Courier→NimbusMonoPS,
  Symbol→StandardSymbolsPS, ZapfDingbats→D050000L. When nothing matches,
  `pdfi_font_substitute_by_flags()` picks from fixed/serif/italic/bold, taking
  bold from **the `ForceBold` flag bit**.
- **PDFBox** substitutes against *installed system fonts* via `FontMapperImpl`
  (Helvetica → ArialMT, Arial, LiberationSans, NimbusSanL-Regu). Exactly one
  font ships in the jar. **The same PDF renders differently on a machine with
  Arial installed than one without.**

Weight and slant are recovered by name regex, not by flags. pdf.js:
`const bold = /bold/i.test(baseFontName); const italic = /oblique|italic/i.test(baseFontName);`
PDFBox does the same. **pdf.js never reads `/StemV` anywhere in `src/core`**,
despite it being the only numeric weight signal in the descriptor.

### The corpus: 17 of 20 XFA forms embed nothing

The config packet says so outright: `<fontInfo><embed>0</embed></fontInfo>`.
Every glyph those 17 forms draw comes from whatever the renderer substitutes.

```
daf1206  embedded=0  Arial-BoldMT, Arial-ItalicMT, ArialMT, Helvetica,
                     Times-Roman, TimesNewRomanPSMT
dd1610   embedded=0  Arial-BoldMT, Arial-ItalicMT, ArialMT, Helvetica,
                     TimesNewRomanPSMT, ZapfDingbats
sf2809   embedded=32 (mostly subset-tagged TimesNewRomanPSMT, BookmanOldStyle, Cambria)
```

Both descriptor shapes appear. Base-14 with no
`/FontDescriptor` at all:

```
<< /BaseFont /Helvetica /Encoding /WinAnsiEncoding /Subtype /Type1 /Type /Font >>
```

and non-embedded TrueType with a full descriptor and 256-entry `/Widths` but no
`/FontFile2`:

```
<< /BaseFont /TimesNewRomanPSMT /Encoding /WinAnsiEncoding /FirstChar 0
   /FontDescriptor 48 0 R /LastChar 255 /Subtype /TrueType /Type /Font
   /Widths [ 778 778 … 250 333 408 500 500 833 778 180 … ] >>
```

Codes 0–31 are filler `778`; from code 32 the values are exact Times AFM
metrics. **`/MissingWidth` is never emitted.**

Two defects in what Designer writes, both consequential:

- **`CourierStd` ships with `/Flags 34`** (Serif + Nonsymbolic), **omitting the
  `FixedPitch` bit**, even though all 256 of its `/Widths` are `600`. Ghostscript
  keys substitution on exactly that bit, so a substituting renderer picks a
  proportional serif for a monospace font.
- **`ForceBold` is never set on any bold face.** Weight is recoverable only from
  `/StemV` (136 against 88) or the BaseFont name, which is why pdf.js and
  PDFBox both fall back to `/bold/i` regexes.

## Text state

Clause **9.3**, Table 105.

**`Tz` is a percentage and the operator divides by 100.** *"Set the horizontal
scaling, Th, to (scale ÷ 100)."* Clause 9.3.4 adds that it *"shall also effect
the spacing parameters Tc and Tw, as well as any positioning adjustments
performed by the `TJ` operator."* Verified numerically: ten Helvetica `W` glyphs
(944/1000 em) at 24 pt measure 226.560 pt at `Tz 100`, 113.280 at `Tz 50`,
453.120 at `Tz 200`.

**`Tw` applies only to single-byte code 32.** Clause 9.3.3, verbatim:

> Word spacing shall be applied to every occurrence of the single-byte character
> code 32 in a string when using a simple font or a composite font that defines
> code 32 as a single-byte code. **It shall not apply to occurrences of the byte
> value 32 in multiple-byte codes.**

**This is why `Tw` is inert for Identity-H composite fonts**. Every code is two
bytes, so no code is "single-byte 32". A generator relying on `Tw` for
justification with Identity-H produces text that renders unjustified everywhere.
Both major implementations enforce it; note that pdf.js's *extraction* path uses
a plain `originalCharCode === 0x20` check **without** the single-byte guard, so
its text layer and its rendering can disagree.

`Tr` (Table 106): 0 fill, 1 stroke, 2 both, **3 invisible**, 4–6 the same plus
clip, 7 clip only. Mode 3 is the OCR-layer convention: invisible text over a
scanned image. An extractor that filters it loses OCR text; one that does not
can double-count.

The displacement formula, clause 9.4.4:

```
tx = ((w0 − Tj/1000) × Tfs + Tc + Tw) × Th
ty =  (w1 − Tj/1000) × Tfs + Tc + Tw
```

Th multiplies only in horizontal mode. Verified exactly on Helvetica `"A A"` at
24 pt across combinations of `Tc`, `Tw` and `Tz`.

**A gotcha found while verifying it, worth carrying:** text state parameters are
*graphics* state, not text-object state. `BT` resets only `Tm` and `Tlm`. A
third `BT…ET` block containing no `Tw` operator at all inherited `Tw=20` from the
preceding block. Measured advance 58.688 pt against 38.688 for the unset case.
**`Tc`/`Tw`/`Tz`/`TL`/`Ts`/`Tr` survive `ET` and are only unwound by `Q`.**

## Type 3 fonts

Clause **9.6.5**, Table 112. Three points that break naive code:

1. **`/Encoding` must be a dictionary with a complete `/Differences`**: *"An
   encoding dictionary whose `Differences` array shall specify the **complete**
   character encoding for this font."* There is no base encoding to fall back on.
2. **`/Widths` are in glyph space, not thousandths**: *"interpreted in glyph
   space as specified by `FontMatrix` (**unlike** the widths of a Type 1 font,
   which are in thousandths)."* Dividing by 1000 gives 1/1000 spacing.
3. **`/FontMatrix` is arbitrary.** `[0.001 0 0 0.001 0 0]` is *"a common
   practice"*, not a rule. Also *"If all four elements of the [FontBBox] rectangle
   are zero, a conforming reader shall make no assumptions about glyph sizes."*

The glyph stream *"shall include as its first operator either `d0` or `d1`"*. A
`d1` glyph *"should not execute any operators that set the colour… any use of
such operators shall be ignored."*

**Extraction is usually impossible.** Clause 9.10.2's three routes to Unicode are
`/ToUnicode`, a standard encoding or `/Differences` using Adobe standard Latin
names, or a predefined CMap. Type 3 `/CharProcs` keys are arbitrary names chosen
by the generator, so route 2 works only by coincidence and route 3 never applies.
The spec closes: *"If these methods fail to produce a Unicode value, **there is
no way to determine what the character code represents**."*

**Zero Type 3 fonts in the corpus.** Not a federal-form concern.

## Inline images and the false `EI`

Clause **8.9.7**, Table 92. *"Unless the image uses `ASCIIHexDecode` or
`ASCII85Decode`… the `ID` operator shall be followed by a single white-space
character, and the next character shall be interpreted as the first byte of image
data."*

**The root cause is a spec omission: there is no `/Length` for an inline image.**
A parser must compute the byte count from `W × H × BPC × components / 8` (only
possible for unfiltered data) or scan for `EI`. For filtered data the length is
unknowable in advance, so scanning is mandatory, and arbitrary binary can contain
`EI`. **The problem is unsolvable at the syntax level.**

Both parsers carry heuristics hardened over a decade. pdf.js checks the next 15
bytes for an ASCII run *and* re-lexes the following 75 bytes against the known
operator table (*"Check that the 'EI' sequence isn't part of the image data,
since that would cause the image to be truncated"*). PDFBox hard-codes an
allow-list of plausible post-`EI` operators with a comment naming its own bug
trail: *"just assuming that 1-3 non blanks is a PDF operator isn't enough…
usually, the operator here is Q, sometimes EMC, S, or a number."* The bug numbers
(pdf.js 8823, 10388, 11124, 19494; PDFBox 1164, 1561, 2376, 3742, 3784, 5957) are
the honest measure of how well heuristics work here.

Corpus inline-image counts are low but non-zero: 13 in `sf15`, 12 in `sf2809`, 9
in `of1164`, 0 in most DAF/DD forms.

## `/ToUnicode`, Identity-H, subset tags

Clause **9.10.2** gives the extraction priority, and **carves `Identity-H` out of
route 3 explicitly**. That is the whole mojibake story: with `/Encoding
/Identity-H` the character code *is* the glyph index in a subset font, an
arbitrary integer with no semantic content. Without `/ToUnicode`, extraction
yields glyph indices reinterpreted as code points. Clause 14.8.2.4.2 makes it a
conformance failure for tagged PDF: *"Tagged PDF documents, in particular, shall
provide at least one of these methods."*

Subset tags, clause **9.6.4**, verbatim: *"the value of the font's `BaseFont`
entry… shall begin with a tag followed by a plus sign (+). The tag shall consist
of exactly six uppercase letters; the choice of letters is arbitrary, but
different subsets in the same PDF file shall have different tags."*

Two consequences: **substitution must strip the seven-character prefix** before
name matching (`ABCDEF+Helvetica` matches nothing in the tables above), and tag
equality is not font identity across merged documents.

## What LiveCycle Designer specifically emits

Measured across the corpus. The producer strings are literally `Designer 6.4`,
`Designer 6.5`, `Designer 2024.07` and, on `sf15`, `Adobe LiveCycle Designer ES
8.2`. The same codebase across four generations and roughly fifteen years.

| Construct | Emitted? |
| --- | --- |
| Tagged PDF (`/MarkInfo`, `/StructTreeRoot`) | **yes**, on 22 of 24 |
| Marked content, heavily | **yes**, `BDC`/`EMC` outnumber `Tj` |
| `/ActualText` | **no**, zero occurrences corpus-wide |
| Form XObjects | **yes on static** (one per widget appearance); **zero on dynamic** |
| Embedded fonts | **no**, 17 of 20 XFA forms embed nothing; `<embed>0</embed>` |
| Type 3 fonts | **no**, zero corpus-wide |
| Optional content groups | **rarely**, 3 of 24, two with `/BaseState /OFF` |
| `Tz` | **rarely**, 0 in most; 14–15 in `of1164` and `sf15` |
| Inline images | **rarely**, 0 in most DD/DAF forms |
| `/ToUnicode`, Identity-H, Type0 | **no**, absent throughout |

`/RoleMap` maps LiveCycle's XFA vocabulary onto standard structure types:

```
/RoleMap << /Draw /Div  /Field /Div  /Page /Part  /Subform /Sect >>
```

and note the placeholder page's marked-content tag is `/Content`, which is **not
a standard structure type** in Table 333, so a consumer keying on tag names will
not recognize it.

## The field names are UTF-16BE hex strings carrying SOM paths

A naive form reader breaks on this outright, and none of the references
consulted for this document covers it.

On nine of the ten static XFA forms, AcroForm field names are **hex strings with
a UTF-16BE BOM** rather than literal strings:

```
<< /DA (/TimesNewRomanPSMT 8.00 Tf 0 g) /FT /Tx /Ff 8388608
   /Rect [ 501.818 290.067 592.582 323.951 ]
   /T <feff0061006400760061006e0063006500310035005b0030005d>
   /TU (15. ADVANCE AUTHORIZED) /Subtype /Widget /Type /Annot >>
```

`/T` decodes to **`advance15[0]`**, the XFA SOM name with its occurrence index.
Decoded across `dd1610.pdf`:

```
form1[0]  #pageSet[0]  page1[0]  page2[0]  Page1[0]  Header[0]
q2-4[0]   q5-7[0]      q8-10[0]  q11[0]    advance15[0]  dateReq[0]
```

Note `#pageSet[0]`, the SOM class-name syntax for an unnamed node, from §3,
appearing verbatim as a PDF field name. The fully-qualified name is composed by
walking the `/Parent` chain:
`form1[0].page1[0].Header[0].dateReq[0]`.

Corpus split:

```
                hex /T   literal /T(
dd1610             74          3
dd1351-2          234          2
of1164            372          2
dd0093             80          4
daf2096             0        113   <- the static XFA form that does not
--- pure AcroForm forms ---
of0306              0         40
sf144               0         62
sf182               0         88
sf2809              1        238
```

**Nine of the ten static XFA forms use hex names. `daf2096` is the exception: it
writes literal strings that still carry the same SOM paths (`topmostSubform[0]`,
`GRADE[0]`). The four pure AcroForm forms are literal, on one hex outlier in
`sf2809`.** A parser that only matches `/T\s*\(...\)` finds three fields in a
47-field form and reports the document as nearly empty.

## The config packet leaks the author's filesystem

Not a rendering concern, but it is in every one of these files and it is worth
knowing before publishing derived artifacts. `<config><present><common><template><base>`
and `<output><uri>` carry the authoring machine's absolute paths:

```
dd1610     C:\Users\<user>\OneDrive - <organization>\<path>\
dd2977     C:\Users\<user>\OneDrive - <organization>\<path>\dd2977.PDF
daf1297    C:\Users\<id-number>\OneDrive - <organization>\<path>\DAF Form 1297 locked.pdf
daf1288    C:\<contractor> work\DAF1288\DAF1288_UNLOCKED.pdf
sf15       P:\<path>\
of1164     H:\<path>\OF 1164 with CUI label.pdf
```

Usernames, organizations, network drive letters, contractor names, and the
internal "locked"/"unlocked" naming convention. Strip the `config` packet, or at
least these two elements, from anything derived and redistributed.

---

# 7. The state of XFA in 2026

## Deprecated in the standard since 2017

ISO 32000-2 (PDF 2.0, published 2017, revised as ISO 32000-2:2020) deprecates
XFA. The ISO text was not readable; the evidence is the PDF Association's own
machine-readable encoding of it, the
[Arlington PDF Model](https://github.com/pdf-association/arlington-pdf-model)
(HEAD `fe4a1a88`, 2026-08-30), whose README defines the `DeprecatedIn` column as
*"the version when the relevant key or array element was deprecated, **as
described in ISO 32000-2:2020**."*

| Key | `DeprecatedIn` |
| --- | --- |
| `InteractiveForm::XFA` | **2.0** |
| `Catalog::NeedsRendering` | **2.0** |
| `ArrayOfXFA::0*`, `::1*` | **2.0** |
| `Permissions::UR3` | **2.0** |
| `SignatureReferenceUR::TransformMethod` (`UR`, `UR3`) | **2.0** |
| `URTransformParameters::*` (all 9 keys) | **2.0** |
| `Name::XFAResources` | **2.0** |
| `InteractiveForm::NeedAppearances` | **2.0** |

So yes on all three questions: XFA is deprecated, `/AcroForm /XFA` and
`/NeedsRendering` are both flagged, and **usage-rights signatures are deprecated
in the same edition**. The flag covers every key of the UR transform machinery,
`Permissions::UR3` and all nine `URTransformParameters` keys alike. For scale, 372 keys across the model carry `DeprecatedIn 2.0`.

Clause numbers: XFA forms is **12.7.8**; usage rights signatures **12.8.2.1**
with the UR transform method at **12.8.2.3**. Source for the latter:
[pdf-issues #804](https://github.com/pdf-association/pdf-issues/issues/804),
opened 2026-09-02, which quotes ISO 32000-2:2020 verbatim and complains that the
referenced clause contains no such information. A fair measure of how much
attention this corner gets.

One nuance: **PDF 2.0 deprecates the XFA feature while still carrying XFA 3.3 as
a normative reference.** From `pdf-association/PDF2NormRefs`, document 26: *"Adobe
XML Architecture XML Forms Architecture (XFA) Specification version 3.3"*, Adobe
Systems, dated **January 2012**, status active. That is the last XFA revision
that exists.

**PDF/A banned XFA earlier than PDF 2.0 deprecated it.** veraPDF's shipped
profiles put the prohibition at ISO 19005-2 clause 6.4.2. That is **2011**, six
years ahead of PDF 2.0, and it is absent from PDF/A-1. Dynamic XFA additionally
fails PDF/UA-1 clause 7.15.

## Adobe's position, with dates

**LiveCycle is dead.** From `helpx.adobe.com/support/programs/eol-matrix.html`
(page last updated 15 May 2026):

| Product | GA | End of core support | End of extended support |
| --- | --- | --- | --- |
| **LiveCycle Designer ES4 (11.x)** | 2013-03-22 | **2018-03-31** | **2020-03-31** |
| LiveCycle Forms / Reader Extensions / Output ES4 | 2013-03-22 | 2018-03-31 | 2020-03-31 |
| LiveCycle Designer ES3 (10.x) | 2012-03-10 | 2017-03-31 | 2019-03-31 |
| AEM Forms (AEM 6.0) | 2014-05-22 | 2018-03-31 | 2020-03-31 |
| AEM 6.5, all capabilities | 2019-04-08 | 2027-02-28 | 2028-02-28 |

Narrative confirmation at
`helpx.adobe.com/support/adobe-livecycle-end-of-core-support.html`: *"Adobe has
discontinued core technical support for Adobe LiveCycle as of March 2018…
Extended technical support… available through March 2020."*

**But the XFA authoring tool is still shipping and still being patched.** AEM
6.5 Forms Service Pack 25 (6.5.25.0), dated **10 June 2026**, ships "Forms
Designer 64-bit patch installers". AEM 6.5 LTS Forms SP2, **18 June 2026**.
Security bulletin APSB26-97, published **25 August 2026**, patches AEM 6.5 LTS
and AEM 6.5 Forms. The only Designer deprecation Adobe states is the **32-bit
build**, deprecated since SP21.

**Adobe has never published an XFA end-of-support announcement.** A sweep of the
full `helpx.adobe.com/sitemap.xml` (15,495 URLs) filtering for
`xfa|deprecat|discontinu|removed|eol` returns only four XFA-bearing pages, and
none of them announces removal:

| Page | Last updated | Says |
| --- | --- | --- |
| `.../pdf-viewing-editing-issues/cannot-edit-xfa-forms.html` | **2026-04-30** | *"Adobe Acrobat Pro (version 2020 and later) does not support direct editing of this XML data."* Editing only |
| `.../mobile/e-sign-documents/pdf-forms.html` | **2026-08-18** | *"XFA forms (dynamic or static…) are not supported. **Acrobat cannot open these form types on mobile.**"* |
| `.../web/e-sign-documents/fill-and-sign/supported-file-formats.html` | **2026-04-01** | *"**Dynamic XFA PDFs will show an error message** indicating they are not supported."* |
| `.../sign/web/kb/does-adobe-sign-support-xfa-pdf-adobe-sign.html` | 2021-04-27 | *"Adobe Sign supports Static XFA PDF but does not support Dynamic XFA PDF."* |

**Two things I set out to confirm do not exist.** There is no Adobe page saying
XFA is unsupported on macOS ARM, and none saying it is unsupported in the "new
Acrobat" experience. The Apple Silicon compatibility page (18 Aug 2026), Acrobat
and Reader system requirements (June 2026), known-issues (29 Jul 2026) and the
switch-to-new-Acrobat page (23 Sep 2025) were all checked and contain no XFA
mention. **State this as "Adobe has published no XFA end-of-support date", not as
a removal.**

**AEM Forms as a Cloud Service: gated, not deprecated.** Two pages both stamped
5 June 2026 that do not quite agree. The FAQ says XFA-based Adaptive Forms can
be created (but not in the local SDK); the known-issues page says support *"is
not available out of the box. If you intend to use XFA-based Adaptive Forms,
contact Adobe Support."* The Cloud Service deprecated-and-removed-features page
(3 Aug 2026) contains **no XFA entry**. So: behind a support ticket, with no
announced removal date.

## Viewer reality

**Chrome/Edge (PDFium).** Chrome **does** compile PDFium with XFA on desktop,
and has since 2021-02-17. `chromium/src/build_overrides/pdfium.gni`:

```
pdf_enable_xfa_override = is_chromeos || is_linux || is_mac || is_win
```

**But XFA rendering is off at runtime.** `pdf/pdf_features.cc`:

```cpp
// Feature has no effect if Chrome is built with no XFA support.
BASE_FEATURE(kPdfXfaSupport, base::FEATURE_DISABLED_BY_DEFAULT);
```

Disabled since at least 2023-11-10. As of **14 November 2025** (commit
`9045259419ed`) it is gated in priority order by enterprise policy
(`PdfXfaFormsEnabled`, marked `chrome_os:144-`), then user choice
(`chrome://flags/#pdf-xfa-forms`), then Finch. The practical answer remains
"Chrome does not render XFA", but the mechanism is a runtime kill switch someone
is actively plumbing enterprise controls into. A live thread, not a settled one.
Upstream PDFium still defaults `pdf_enable_xfa_override = false` standalone. The
tracking bug is crbug.com/62400 → issues.chromium.org/40084716, created
2010-11-08, last modified 2026-04-27.

**Firefox/pdf.js: shipped, and still on.** Firefox **93, released 5 October
2021**. It slipped from 92 first. Bugzilla
[1727396](https://bugzilla.mozilla.org/show_bug.cgi?id=1727396) is
`status_firefox92: wontfix`, `status_firefox93: verified`; the meta bug is
[1706133](https://bugzilla.mozilla.org/show_bug.cgi?id=1706133). Release notes:
*"Firefox PDF viewer now supports filling more forms (XFA-based forms, used by
multiple governments and banks)."*

**Still enabled by default in September 2026.** pdf.js master `web/app_options.js`
sets `enableXfa` to `value: true`; Firefox's
`toolkit/components/pdfjs/PdfJsDefaultPrefs.js` has `pref("pdfjs.enableXfa", true)`.
No deprecation issue exists and `src/core/xfa/` has commits as recent as
2026-08-31.

**Note the split**: the *library* API defaults the other way.
`src/display/api.js`: *"`[enableXfa]` - Render Xfa forms if any. **The default
value is `false`.**"* Embedders get XFA off; the bundled viewer turns it on.

Caveat: **XFA scripting was never implemented** (meta bugs 1717661 and 1724398
still NEW), which is why complex XFA forms still fail in Firefox.

**Apple Preview / PDFKit.** No XFA API surface exists. PDFKit, PDFAnnotation
and PDFDocument structured docs contain zero occurrences of "xfa". That is
absence of any surface, not a published refusal. Apple has said nothing either
way.

**The open-source stack preserves the packet and does not render it:**

| Tool | Position |
| --- | --- |
| **Ghostscript** | Zero "XFA" across all docs and the PDF interpreter. Renders AcroForm appearance streams only, and pdfwrite does not preserve widget annotations at all |
| **MuPDF** | Parses the packet **only** to determine signature field locking. Exposes `wasPureXFA()` for detection. No layout or render path |
| **qpdf** | **XFA appears nowhere in the manual**, zero hits across every `.rst`. Preserves `/AcroForm/XFA` as opaque objects; `--remove-acroform` drops it as collateral |
| **PDFBox** | Preserves and exposes via `PDXFAResource`, never renders. `flatten()`: *"for dynamic XFA forms there is no flatten as this would mean to do a rendering from the XFA content into a static PDF"* |
| **veraPDF** | Normative, not a renderer. `/XFA` fails PDF/A-2/3/4; dynamic XFA fails PDF/UA-1 |

## The US federal form estate

**There is no dated, authoritative US federal policy statement about XFA. None.**
Not at WHS, not at AF e-Publishing, not at GSA, OPM, IRS or section508.gov, not
in OMB memoranda, not in statute. **No federal document reached uses the string
"XFA" at all.** Say this plainly rather than inferring a policy from the
existence of forms.

What exists instead is a general digital-forms mandate that never names a format:

- **21st Century IDEA**, Pub. L. 115-336, enacted **20 December 2018**. Zero
  occurrences of "XFA", "PDF" or "Adobe". §4(c) requires each agency to make
  paper forms available "in a digital format" within two years. A deadline of
  20 December 2020.
- **OMB M-23-22**, "Delivering a Digital-First Public Experience", **22 September
  2023**. **Zero occurrences of "XFA"**; two of "PDF", one a footnote URL. The
  load-bearing text is definitional: *"'Digital form' means a **web application**
  that has the capability to capture, validate, submit, and process structured
  information digitally."* and *"The design and development of digital forms
  should be prioritized over the creation of paper forms or **electronic
  forms**."* Under its own taxonomy a fillable PDF is an *electronic* form, not a
  *digital* one, and digital forms outrank it. That is the closest thing to a
  federal position, and it is oblique.
- **section508.gov**'s PDF guidance (reviewed August 2025) contains **no mention**
  of PDF forms, fillable PDF, XFA, LiveCycle or Adobe form technology.

**Meanwhile the estate is still producing XFA in 2026.** Measured on live
downloads, 2026-09-03:

| Form | Class | Producer | PDF CreationDate | `/UR3` |
| --- | --- | --- | --- | --- |
| **IRS f1040** ("2025 Form 1040") | XFA-static | **Designer 6.5** | **2026-01-02** | yes |
| **IRS f941** (Rev. March 2026) | XFA-static | Designer 6.5 | **2026-02-25** | yes |
| IRS fw9 (Rev. March 2024) | XFA-static | Designer 6.5 | 2024-03-06 | yes |
| **OPM SF-86** | XFA-static | **Adobe LiveCycle Designer 11.0** | 2017-09-28 | n/a |
| OPM SF-52 | plain AcroForm | Acrobat Distiller 2.1 | 2000 | n/a |

The 2025 Form 1040 was authored as an XFA form on **2 January 2026**. Nine years
after PDF 2.0 deprecated XFA, and nearly six years after Adobe's extended support
for LiveCycle ended. These are not legacy files sitting untouched; they are new
production this year.

The corpus in this repository says the same thing from the other direction.
`daf1288.pdf` was created **2025-09-15** by `Designer 2024.07`, and its config
packet declares `<adobeExtensionLevel>11</adobeExtensionLevel>`. `dd1610.pdf`
was modified **2026-07-07**. New XFA production, this year and last.

**A typical DD or IRS form simultaneously uses three constructs that ISO
32000-2:2020 deprecates**: `/AcroForm /XFA`, `/Perms /UR3`, and on dynamic ones
`/NeedsRendering`. It is by construction invalid PDF/A-2/3/4.

The one dated signal of institutional awareness found anywhere: WHS added the
"open in Adobe Acrobat Reader, some forms may not display correctly in a web
browser" notice to its form index pages **between the 2026-02-01 and 2026-02-17
Wayback snapshots**. A precise description of the XFA failure mode, written
without ever naming it.

## What replaced XFA

**AcroForm is the surviving ISO-standardized PDF form technology.** In the
Arlington model the AcroForm dictionary's core keys (`Fields`, `DA`, `DR`, `Q`,
`SigFlags`, `CO`) carry no `DeprecatedIn`. Only `XFA` and `NeedAppearances` are
marked 2.0. **PDF 2.0 did not deprecate PDF forms; it deprecated Adobe's XML
overlay on them.**

Adobe's own successor is web forms: AEM Forms Adaptive Forms, where XFA/XDP
survives only as an import path behind a support ticket. The federal answer is
also web forms, per M-23-22's "digital form means a web application" definition
and USCIS's online-filing migration. **Nobody is recommending mass XFA-to-AcroForm
conversion as policy.**

The practical migration paths, by what tooling actually supports:

1. **Static/hybrid XFA → AcroForm** is mechanical, because the file already
   carries a complete AcroForm field tree. PDFBox's `flatten()` does
   `dictionary.removeItem(COSName.XFA)`; qpdf's `--remove-acroform` drops it
   wholesale. Ten of the 24 corpus forms are in this class.
2. **Dynamic XFA has no mechanical path in those tools.** PDFBox refuses outright. The fields exist only as XML, and turning that into positioned boxes means running an XFA layout engine. `src/lib/services/pdf-import/xfa.ts` runs the one in pdf.js in the browser and writes the result back as a static AcroForm; section 8 has the mechanism.
3. **Dropping `/UR3` is required either way**. The signature breaks on any
   modification, and PDF 2.0 deprecates it.

**[UNVERIFIED]**. No pdfa.org migration guidance for XFA forms was found; the
domain 403s. The only XFA-to-AcroForm item hosted there is a member press
release (pdfRest, 24 September 2024), which is vendor content, not association
guidance.

---

## Uncertainty register

Everything in this document that could not be confirmed, in one place.

| Claim | Status |
| --- | --- |
| Normative XFA text (structure, defaults, units, layout semantics) | **Never read.** `pdfa.org` 403s on every path; `XFA-3_3.pdf` was not retrieved. All XFA structure here comes from pdf.js, PDFium and Adobe's Designer Scripting Reference |
| ISO 32000-2:2020 clause numbers and deprecation flags | **Second-hand.** `iso.org` 403s. Sourced from the Arlington PDF Model and verbatim quotes inside `pdf-association/pdf-issues` |
| The XFA default measurement unit for a bare number | **Unresolved.** PDFium yields 0; pdf.js yields points. Both are implementation choices, not a quoted rule |
| Bit 10 described as "deprecated" in PDF 2.0 | Wording is qpdf's and MuPDF's. Arlington encodes it as "must be set since 2.0", same practical effect |
| The invalid-UR3 Acrobat banner wording | **Approximate.** The positive banner is attested via PDFBox JIRA; the invalid-state tail is from a third-party source. `helpx.adobe.com` timed out |
| XFAF structure (`/ContentArea BMC` XObject tree, zero `Tj`) | **Sourced, not measured.** The corpus contains no XFAF form |
| Placeholder Variant C, the Designer 11.0 wording | **Sourced, not measured.** No corpus form carries a Designer 11.0 producer string |
| Static full-XFA page content carrying real glyphs | Inferred from the static/hybrid corpus forms, which do carry glyphs; no isolated XFAF-vs-static A/B was run here |
| "LiveCycle does not embed fonts **by default**" | **Fact for these files** (0 of 22 font programs across four Designer generations: 6.4, 6.5, ES 8.2, 2024.07), **not** established as a documented product default |
| `Designer 6.5` / `Designer 2024.07` as the renamed LiveCycle Designer | Consistent with identical XFA 3.3 output; **not** confirmed against Adobe product-lineage documentation |
| DFRWS publications on PDF forensics | **No citations.** `dfrws.org` 403s. Do not infer that such papers exist from this document |
| Air Force form technology statements | **Zero direct evidence.** `e-publishing.af.mil` 403s and its "Opening PDF from EPUBS" advisory is not archived. DAFMAN 90-161 names LiveCycle as the authoring tool but says nothing about Reader Extensions |
| DoDI 7750.07 / DoD Manual 7750.08 | **Not read.** If a DoD format policy exists, it would be in DoDM 7750.08 |
| Federal XFA migration policy | **Does not exist, as far as could be established.** Absence of evidence after a targeted search, across eight domains |

## See also

- [`ADOBE_PDF_FORENSICS.md`](ADOBE_PDF_FORENSICS.md) records what this app's
  import pipeline found and fixed in the same corpus: the `/Contents`-array bug,
  the encryption handling, and the pdf.js SOM null-dereference in `daf1288.pdf`.
- `scripts/characterize-forms.mjs` classifies any corpus form.
- `demo/samples/README.md` describes both corpora.

---

# 8. Converting a dynamic form in a browser

Everything above says a dynamic form's fields exist only in the template and
that laying them out takes Adobe's engine. pdf.js has an engine, it is
open-source, and it runs in a tab. This section records what driving it costs
and what it gives back, measured against the ten dynamic forms in the corpus.
`src/lib/services/pdf-import/xfa.ts` is the implementation.

## The shape of the step

Bytes in, bytes out. A dynamic form becomes an ordinary static AcroForm with the
printed page redrawn as page content and the fields stamped as widget
annotations, and every other stage of the pipeline is unchanged. A file that is
not pure XFA is returned untouched, so there is one path rather than two.

```
getDocument({ data, enableXfa: true })
  → page.getXfa()                              per page: the layout tree
  → XfaLayer.getPageViewport(xfa, { scale: 1 })
  → XfaLayer.render({ viewport: vp.clone({ dontFlip: true }), div, xfaHtml })
  → the browser solves layout
  → read rects, read text, read controls
  → pdf-lib: draw the primitives, stamp the widgets
```

`enableXfa: true` alone is not enough: DAF Form 1288 takes the whole document down without `patches/pdfjs-dist+6.3.289.patch`, and it is the only form in the corpus that does. The patch is load-bearing for this step.

## The units are already points

pdf.js normalizes every XFA measurement to points and emits them as CSS `px`, so
one px is one pt and a Letter page div is exactly 612 by 792. No 96/72
conversion, no flip. `(rect.left - origin.left, rect.top - origin.top)` is
already the top-left-origin points rect the `acroform` backend wants, which is
the same rect `toTopLeftRect` produces for an ordinary AcroForm widget.

## Three ways to zero every rect

**`display: none` on the host.** Measured on DAF 1288: 116 of 116 fields come
back at 0 by 0, maximum delta 733 pt, with no error anywhere. The host has to be
laid out. Position it off the left edge instead.

**Sibling layers with no wrapper.** `.xfaLayer` is `position: absolute; top: 0;
left: 0`, so two page layers appended to one container both resolve against the
initial containing block and every page after the first measures against the
wrong origin. Each page needs its own `position: relative` wrapper.

**Reading the page origin late.** Read the wrapper's rect once, before the
harvest loop, and do not scroll between reading it and reading the fields.

## The stylesheet is not optional

`XfaLayer.render` emits a DOM carrying no style of its own. Without the XFA slice of `pdfjs-dist/web/pdf_viewer.css` every field lays out at its content size and the geometry is fiction. The slice is `src/lib/services/pdf-import/xfa-layer.css`, injected into a `<style>` beside the offscreen host so none of it reaches the app's own document.

A vendored slice goes stale silently on a pdfjs-dist upgrade. What notices is a
fixed-rect assertion: DD 2875's `type_of_request` at
`(19.08, 153.74, 242.64 x 16.31)` to a tenth of a point. That one number catches
a stale stylesheet, a pdf.js layout change and a Chromium change alike, which a
byte comparison on the CSS file would not.

## Where the names live

Not on the control. Of 831 fields across the ten forms, 803 carry neither a
`name` nor an `id` attribute, and the 28 that do are exclusion-group ids like
`exclGroup8817-display`. The name is the `xfaname` attribute on the enclosing
`div.xfaField[data-element-id]`, and the SOM path is those attributes from the
layer root down:

```
div.xfaPage[xfaname=Page1]
  div.xfaSubform[xfaname=form1]
    div.xfaSubform[xfaname=page1]
      div.xfaSubform[xfaname=TypeRequest]
        div.xfaField[xfaname=type_of_request]
          label.xfaLabel > select.xfaSelect
```

which composes `Page1.form1.page1.TypeRequest.type_of_request`. Paths recur:
nine do within DAF 1288, and every field on its second page also begins
`Page1.`, so a page number and a per-page occurrence count go in front.

## Where the labels live

Three places, in this order, covering 740 of the 831:

| Source | Where | Coverage |
| --- | --- | --- |
| `aria-label` | on the control | 42 of 44 on DD 2875 page 1 |
| `title` | on the enclosing `div.xfaField`, **not** on the control | the same fields, worded slightly longer |
| `.xfaCaption` text | inside `div.xfaField > label` | 19 of 51 on DAF 1288 page 1 |
| `.xfaCaptionForCheckButton` text | the same place, renamed | every radio and every checkbox |

That last row is the one that is easy to miss. pdf.js special-cases a
check-button UI and rewrites the caption div's class, so a selector that asks
only for `.xfaCaption` sees no radio label and no checkbox label in any XFA
form. DAF 3902's template contains zero `<toolTip>` elements and nine
`<caption>` elements, and all nine sit on check buttons, so it went from nine
labels to none on that one selector. The vendored `xfa-layer.css` carries both
class names already, which is where the mismatch shows.

DAF 1288 carries zero `title` and zero `aria-label` on any of its 116 fields, so
it is the case that proves the caption fallback is needed and the case that
proves the model still has to name the rest off the raster.

They belong in `/TU` on the **widget annotations**, not on the field.
`AnnotationFactory` reads `dict.get("TU")` off the annotation dictionary and
does not inherit it from the parent, and pdf-lib's `addToPage` puts the widget
in `/Kids`, so setting `/TU` on the field dictionary reads back as nothing.

## Exclusion groups

`div.xfaExclgroup[xfaname]` encloses the members of one `<exclGroup>`. DAF 1288
has nine groups holding 26 radios; DAF 912 has one holding two. They stamp as
real AcroForm radio groups, one parent field per group with one kid widget per
member, and the on-state comes from the SOM leaf (`Yes`, `No`, `NA`).

The alternative, one boolean per option, is wrong twice over: every option of an
exclusive group could be ticked at once, and `form@0.2.0` carries no per-widget
on-state, so binding one enum across the group would stamp the chosen value into
every member. `radio-binding.svelte.test.ts` pins that second fact.

## What the transcription can draw, and what it refuses

Text, CSS backgrounds and borders, and inline SVG `line` and `rect`. Nothing
else, and an element it cannot express refuses by name and page rather than
being skipped: a government form that comes out silently incomplete is worse
than one the importer declines. Zero of the twenty-three pages in this corpus
hit the refusal, which is exactly why an ink-difference threshold would not have
worked as the trigger. The maximum per-page missing ink measured is 5.2% and the
maximum spurious 7.4%, almost all of it glyph edges, so no threshold separates
"a logo went missing" from "Helvetica is not Arial".

Three transform facts matter, and each cost a form.

XFA offsets caption wrappers with `transform: matrix(1, 0, 0, 1, tx, ty)`, a
pure translation, which `getBoundingClientRect` already accounts for; refusing on
`transform !== 'none'` refuses three of the ten forms for nothing.

A positive horizontal scale is also carried. LiveCycle writes
`xfa-font-horizontal-scale` inside `<exData contentType="text/html">` values and
`<font fontHorizontalScale>`, and pdf.js turns both into `scaleX()`. DAF 988
carries six, at 96% to 104%. `getClientRects` reports the scaled width and
`drawRuns` puts it back as `Tz`, so the run lands correctly; refusing on "not
the identity" refused the form for a rotation it does not have. The predicate
has to ask whether the primitives can carry the matrix, not whether it is the
identity.

What is genuinely out of reach is a rotation, a skew, a mirror or a vertical
scale, because a run carries a font size and a width and neither expresses a
changed glyph shape or height.

## Five defects worth knowing about

**pdf-lib tests for the key, not for undefined.** `PDFTextField.js:626`,
`PDFCheckBox.js:121`, `PDFDropdown.js:461` and `PDFOptionList.js:379` all read
`if (!('backgroundColor' in options)) options.backgroundColor = rgb(1, 1, 1)`.
Omitting the key gives every widget an opaque white box with a black border over
the page you just drew. On DD 2875 that erases the classification banners at the
top and bottom of every page. Pass `backgroundColor: undefined,
borderColor: undefined` explicitly.

**`input[type=radio]` needs its own branch.** A `select`/`checkbox`/else chain sends it to `createTextField`, which turns DAF 1288 item 15, a three-way rated question, into three free-text boxes.

**Checkbox chrome is not the element box.** `.xfaCheckbox` is
`width: 100%; height: 100%`, so the control's rect is the whole field box: 10 to
14 pt wide by 12.2 to 21.6 pt tall across 127 checkboxes. Drawing the printed
square at that height makes it about 2.4x too tall and merges vertically
adjacent boxes into a bar. Draw it square at `min(width, height)`.

**`stroke-width: 0px` is not falsy after `parseFloat`, but `|| 1` makes it 1.**
Six of DD 2875's ten inline SVG rects (nineteen corpus-wide) carry a zero stroke
and `stroke: none`, and both have to be checked or they paint as 1 pt black
boxes the browser does not paint.

**Letter spacing has to go in before the width correction.** 1,138 of 1,673
ink-bearing text runs carry a non-zero computed `letter-spacing`. Pinning the
run's total width with horizontal scaling (`Tz`) alone puts the line end in the
right place and every glyph inside it in the wrong one. Set `Tc` first, then
compute `Tz` on the residual.

And one quieter thing: a `<select>` replaced by an inert box loses its content,
which is how DD 2875's UNCLASSIFIED banners disappear without any metric
noticing, because they are `<select>` elements. Render the selected option's
text.

## What it costs

| Form | Pages | Fields | Radios | Converted | Background after strip |
| --- | ---: | ---: | ---: | ---: | ---: |
| dd2875 | 3 | 78 | 0 | 74.1 KB | 54.2 KB |
| dd2977 | 3 | 45 | 0 | 48.3 KB | 39.1 KB |
| dd0200 | 4 | 176 | 0 | 128.0 KB | 68.8 KB |
| daf1206 | 2 | 12 | 0 | 9.8 KB | 6.6 KB |
| daf1288 | 2 | 116 | 26 | 117.6 KB | 96.6 KB |
| daf1297 | 1 | 100 | 0 | 46.9 KB | 5.5 KB |
| daf707 | 2 | 63 | 0 | 61.5 KB | 46.4 KB |
| daf910 | 2 | 88 | 0 | 84.3 KB | 61.4 KB |
| daf911 | 2 | 63 | 0 | 56.7 KB | 34.3 KB |
| daf912 | 2 | 57 | 2 | 46.5 KB | 28.0 KB |

798 usable widgets, zero zero-area rects, zero rects outside the page box, zero duplicate field names.

## What is still lost

The text is redrawn in the standard-14 faces. Seventeen of the twenty XFA forms
embed no fonts at all, and pdf.js's own XFA font registration does not resolve
in this configuration, so the browser lays the text out in a fallback face and
the transcription draws it in Helvetica, Times or Courier stretched to the width
the browser measured. Arial and Helvetica are near-identical by design and the
result is legible and correctly positioned, but it is a substitution, not a
copy. Embedding the real faces would need a font subsetter in the browser.

Chromium is the only engine measured. The geometry comes from a layout the
browser solved, so a different engine could solve it differently; the fixed-rect
assertion is what would say so.

Every form in the corpus is a blank template. A filled dynamic form reflows its
subforms to fit the data, so the layout transcribed from an uploaded copy is
that copy's layout, not the blank form's.
