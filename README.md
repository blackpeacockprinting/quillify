# quillify

Turns a published PDF form into a Quillmark quill for the `acroform` backend.

The backend takes a background PDF with no form layer and a `form.json` that says where each field goes. Published forms do not come that way. Of 59 federal forms measured, 38 are encrypted with an empty password, and 17 are dynamic XFA: the file holds a placeholder page, such as one that says "Please wait…", and a template that Acrobat lays out when it opens it. Of 966 PDFs on the Air Force's departmental form list, 702 are dynamic XFA. This package reads such a file and writes the background, the `form.json` and the `Quill.yaml` beside them.

It is logic and tests with no interface, and it runs in a browser.

## Use

```ts
import { init } from '@quillmark/wasm';
import { quillify, sanitize, suggest } from 'quillify';

const read = await sanitize(pdf);
if (!read.ok) throw new Error(read.refusal.code);

const built = await quillify(read.form, {
	name: 'tdy_request',
	description: 'Request and authorization for TDY travel.',
	fields: suggest(read.form.fields)
});
if (!built.ok) throw new Error(built.problems.map(({ code }) => code).join(', '));

const { Quill } = await init();
const quill = Quill.fromTree(built.tree);
```

`pdf` is the file's bytes as a `Uint8Array`, which `sanitize` checks first: an `ArrayBuffer`, a `DataView` or any other typed array, an `Int8Array` too, rejects with a `TypeError`. A test runs this block as it is printed.

`sanitize` is where every byte of the file is parsed. It removes the encryption, converts a dynamic form to a static one, lists the fields and strips the form layer. `suggest` names each field from the form's own tooltip, or from its field name when it has none, and describes it with the tooltip. Where two options of one group share a tooltip it adds each option's on-state to the name and to the description, so the options do not read alike. It keeps every field a person can fill. Its result is a starting point: the names are what a person or a model corrects before the quill is built, and `check(fields, naming)` lists the problems of a naming that it can find without the engine. `quillify` runs `check`, writes the files and shows them to the engine, whose own refusals come back from `quillify` alone. `built.tree` is a `Map` from `Quill.yaml`, `form.json` and `form.pdf` to their bytes, with `example.md` when a kept field has an example to show. `ok` means `Quill.fromTree` took the tree, and that call reads `Quill.yaml` alone. The engine first reads the background and `form.json` when the caller opens or renders a document.

A naming is `{ name, description, fields }`. Each entry of `fields` is `{ id, keep, name, description }`, with an optional `example` and, on a text field, an optional `text`: `line`, `paragraph` or `lines`. A read-only field is left out whatever `keep` says. An `example` is used on a text field, trimmed and cut to `maxLength` when the field has one, and on a choice when it is one of the options. A choice given any other example, or none, shows its first option, and a checkbox, a radio button and a signature show none.

## What comes back

`sanitize` resolves to `{ ok: true, form }` or `{ ok: false, refusal }`. A `Form` is the background (`pdf`), the page sizes in points (`pages`) and the `fields`. Every `Field` has an `id`, one or more `places` (a zero-based `page` and a `rect` in points from the page's top left), `required`, `readOnly`, the form's `tooltip` when it has one, and a `kind`:

| `kind`      | It also carries                                                                             |
| ----------- | ------------------------------------------------------------------------------------------- |
| `text`      | `multiline`, and `maxLength` when the form sets one                                         |
| `checkbox`  |                                                                                             |
| `radio`     | `group`, the name its buttons share, and `on`, this button's value, when the file gives one |
| `choice`    | `options`                                                                                   |
| `signature` |                                                                                             |

Checkboxes that share a field name and turn on as different values are `radio` fields too, one for each box: the file lets one value be ticked.

A file the library does not take is refused with a value, and nothing is thrown for it. Ten of the 59 forms are refused, so a caller meets this branch often.

| `code`            | It carries                                          | The file                                                                                                            |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `too_large`       | `bytes`, `limit`                                    | is over 8 MiB, or comes to over 64 MiB with its streams decoded. `limit` says which                                 |
| `too_slow`        | `limit`, in seconds                                 | has `sanitize` waiting on a worker 60 s after the call                                                              |
| `not_pdf`         |                                                     | is not a PDF                                                                                                        |
| `password`        |                                                     | needs a password to open                                                                                            |
| `encryption`      |                                                     | is encrypted in a way pdf.js does not read, such as to a certificate                                                |
| `damaged`         |                                                     | opens, and qpdf cannot rewrite it, a page or an object can be read in two ways, or a stream of it cannot be counted |
| `portfolio`       | `attachment`, when it has a name                    | is a portfolio, whose form is an attachment                                                                         |
| `too_many_pages`  | `pages`, `limit`                                    | has more than 20 pages                                                                                              |
| `too_many_fields` | `fields`, `limit`                                   | has more than 200 fields                                                                                            |
| `layout`          | `detail`                                            | is a dynamic form pdf.js cannot lay out, or gives a page of no size                                                 |
| `no_fields`       | `xfa`                                               | has no field; `xfa` is true when it holds an XFA form that nothing laid out                                         |
| `rotated`         | `page`                                              | has a page that is still rotated once qpdf has flattened what it can                                                |
| `unpaintable`     | `page`, `construct`, and `detail` when there is one | is a dynamic form with something on a page that the redraw does not draw                                            |

`construct` is one of `image`, `background_image`, `svg`, `border`, `transform` and `glyph`. `detail` is the SVG element, the border style or the text that could not be drawn. For `layout` it is the message of the exception pdf.js's layout threw, in the browser's wording, or `a page has no size` when pdf.js gives a page a width or a height that is not above zero. The library has no sentence for a code: the caller maps `code` to its own words.

`check` and `quillify` return the problems of a naming:

| `code`              | It carries                                               | What is wrong                                            |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `quill_name`        |                                                          | The quill's name is not snake_case                       |
| `quill_description` |                                                          | The quill's description is empty or blank                |
| `nothing_kept`      |                                                          | No field a person can fill is kept                       |
| `unknown_field`     | `id`                                                     | An entry names a field the form does not have            |
| `unnamed_field`     | `id`                                                     | A field of the form has no entry                         |
| `repeated_field`    | `id`                                                     | A field has two entries                                  |
| `field_name`        | `id`                                                     | A kept field's name is not snake_case                    |
| `duplicate_name`    | `name`                                                   | Two kept fields share a name                             |
| `text_on_non_text`  | `id`                                                     | `text` is set on a field that is not a text field        |
| `engine`            | `message`, and `diagnostic` when the engine gives a code | The engine refused the files. Only `quillify` returns it |

A naming of the wrong shape, a model's JSON with a name missing for one, is no problem of this kind: `check` and `quillify` end with a `TypeError` that names the slot.

Outside `code`, `kind`, `construct` and `diagnostic`, a string in a `Form`, a refusal, a suggested naming or a problem is text from the file or from the naming handed in: a field's `id`, a tooltip, an option, whatever the engine's `message` quotes. Show it as text and trust none of it. [`SECURITY.md`](SECURITY.md) has the boundary, what the background keeps and what is not handled.

## What it does to a PDF

1. **Normalize.** qpdf, compiled to WebAssembly and run in a worker of its own for each file, removes the encryption an empty password opens, folds page rotation into the page, writes every object outside an object stream and writes every stream it can decode back as one Flate stream. What it wrote is then held to 64 MiB with those streams decoded.
2. **Convert.** For a dynamic form, pdf.js lays the XFA template out in a sandboxed frame, whose document takes no rule from the host page and gives it none, and the layout is redrawn as a static PDF with an AcroForm field where each XFA field sat.
3. **Inventory.** Each widget is read: its kind, its page and rect, its flags and its tooltip.
4. **Strip.** pdf-lib removes the form layer. A table lists the keys each kind of dictionary keeps, and every other key and every object nothing reaches is dropped.
5. **Assemble.** `Quill.yaml` and `example.md` are written from the naming and `form.json` from the places, and the background goes in as `form.pdf`.

[`prose/canon/ARCHITECTURE.md`](prose/canon/ARCHITECTURE.md) has how the code is laid out, module by module, and what parses the bytes of a file. [`prose/research/XFA_INTERNALS.md`](prose/research/XFA_INTERNALS.md) has how the conversion works. [`prose/DECISIONS.md`](prose/DECISIONS.md) has what was decided at each stage and what would unlock a different answer.

## What it leaves to the consumer

- The interface, including the screen where a person reviews and corrects field names.
- Any model. Names come from the form's own tooltips, or from whatever the consumer supplies.
- Storage, and what happens to a quill once it is built.

## What it needs

- A browser, for `sanitize`. A dynamic form is laid out by the browser, in a hidden frame of no size that is in the host page's body while a file converts, and the pdf.js worker, the qpdf worker and qpdf's binary load as a browser loads them ([#34](https://github.com/tonguetoquill/quillify/issues/34)). The browser's `DecompressionStream` counts what a file's streams decode to, and Chromium is the one browser measured. `suggest`, `check` and `quillify` need no DOM.
- `@quillmark/wasm` 0.124.0 or later, as a peer.
- A bundler that follows `new URL('../assets/…', import.meta.url)`, which is how the build finds the three files it loads at run time: `pdf.worker.js`, a module worker, `qpdf.worker.js`, a classic worker, and `qpdf.wasm`. Vite 8.3 is the one bundler measured ([#101](https://github.com/tonguetoquill/quillify/issues/101)).
- A host page that lets a worker start from each of the two scripts where the bundler puts them, and lets the qpdf worker fetch `qpdf.wasm` from there and compile it. `sanitize` starts one qpdf worker for each file and ends it, so `qpdf.worker.js` and `qpdf.wasm` are requested again for each file.

## Measured

- **Ten files in the gate.** Nine published forms and one synthetic go through `sanitize`, `suggest` and `quillify`. The engine renders each quill, and every kept field is read back from the rendered PDF on the page and at the rect `form.json` gives.
- **59 published federal forms.** 49 convert. The engine renders each, and a field is read back at each of the 3,670 places `form.json` gives. Ten are refused: eight hold more than 200 fields, one has no field and one is a portfolio. [`corpus/`](corpus/README.md) names the forms, and `npm run corpus` reruns the measurement on a directory of them.
- **The page under the form layer.** With annotations not drawn, the gate has pdf.js paint each of the ten files' 29 pages twice, as the strip was given it and as the background, and holds the two to the same pixels. A dynamic form's page there is the redraw, and no test yet compares a redraw with the layout it was read from ([#110](https://github.com/tonguetoquill/quillify/issues/110)). Outside the gate, Poppler compared the 1,792 stored pages of 1,395 published PDFs at 60 dpi, inside the crop box and with annotations hidden, and found none changed. For a dynamic form the stored page is its placeholder page.
- **The app it came from.** With the package in place of the importer in a scratch clone of `tonguetoquill/web-app-afa-demo`, the app's own script drives its dialog over the 59 forms and gets the counts it got before: 49 exported and 10 refused, form by form, under the app's content security policy. One form has more fields to name in the dialog than the app's importer gives it: WH-380-E, 74 against 59, since its checkboxes of one name and several on-states are a field each. [`prose/research/ACCEPTANCE.md`](prose/research/ACCEPTANCE.md) has the test, where the two sets of exports differ, what pdf.js and PDFKit read from a filled form, and what renders of the three dynamic fixtures show. [`prose/research/VIEWERS.md`](prose/research/VIEWERS.md) has what PDFKit, the framework under Preview, and Chrome's viewer make of the ten filled forms when a script drives them with no window: each opens every form with no "Please wait" page, PDFKit reads back a value it set and saved, and Chrome shows no dialog and shows a typed character in its field. Acrobat has not been looked at, and no person has opened Preview or Chrome on one ([#17](https://github.com/tonguetoquill/quillify/issues/17)).
- **1,354 PDFs from the Air Force's form lists.** 798 convert. They hold 54,492 fields, and every kept one was read back in place. 157 have no field, 14 of them a notice the site serves in place of a form it does not publish, and 4 are portfolios, each a cover page around a rights-managed attachment that nothing here opened. Of the other 1,193, 67% convert, and the 200-field cap is the largest reason for the rest, at 230 files. The run was made once, on the library at `465a328`, with a runner outside the repository. At that commit the redraw left out a rectangle that has a fill and no border, which 100 of the 798 hold: 99 of them as rules or shading their page was missing, and one as a white rectangle. The redraw draws them now ([#106](https://github.com/tonguetoquill/quillify/issues/106)), and the run has not been repeated. [`prose/research/AF_EPUBS_FORMS.md`](prose/research/AF_EPUBS_FORMS.md) has its tables, and [`corpus/af-epubs.manifest.json`](corpus/af-epubs.manifest.json) one line per file.

## Limits

- A form over 20 pages or 200 fields is refused ([#40](https://github.com/tonguetoquill/quillify/issues/40)). A dynamic form over the page cap is refused before a page of it is laid out in the host page. pdf.js has laid out every page in its worker by then, to count them, and the form's fields are counted once its pages, 20 at most, have been laid out and redrawn. A file over 8 MiB is refused, and so is one that comes to more than 64 MiB with its streams decoded, or that has qpdf write or hold more than that. A stream that cannot be counted gets its file refused as `damaged`: one the browser's decoder rejects, and one under RunLength, under a filter the library does not know or under more than one filter before an image codec. So does a name that is `/ObjStm` or `/XRef` or begins with one, anywhere in the file qpdf wrote: those are the types of the two streams pdf-lib inflates as it parses, and a stream typed as one that is neither keeps the name. No published form on hand is refused for any of these. An image counts as stored, whatever its pixels come to ([#163](https://github.com/tonguetoquill/quillify/issues/163)).
- A file that has `sanitize` waiting on a worker 60 s after the call is refused as `too_slow`. The worker, qpdf's or pdf.js's, is ended then, and the frame a form is laid out in is taken out. The limit is no option. Work on the calling thread is not interrupted and not timed, so a call can settle later than 60 s: the signal fires when the thread is next free, and the file is refused where the call next waits on a worker. The strip is the last stage and starts none, so a call that has reached it returns what the strip gives. Of the 59 forms the slowest takes 2.7 s here.
- A dynamic form with an image or a dashed border is refused ([#42](https://github.com/tonguetoquill/quillify/issues/42)), and so is one whose text holds a character the standard fonts cannot encode, most often a tab ([#87](https://github.com/tonguetoquill/quillify/issues/87)). One that converts is redrawn in Helvetica, Times or Courier, whatever face it was published in ([#44](https://github.com/tonguetoquill/quillify/issues/44)), and its signature fields are left out with their captions ([#43](https://github.com/tonguetoquill/quillify/issues/43)): 236 of the 590 dynamic Air Force forms the recorded run converted have one, and in 83 a printed caption goes with it ([`prose/research/SIGNING.md`](prose/research/SIGNING.md)). A field with a barcode, a password, an image or no control of its own is left out the same way ([#114](https://github.com/tonguetoquill/quillify/issues/114)). A rectangle's border is redrawn half its width inside where the layout has it, a rounded corner square, and every box under every line and all the text ([#111](https://github.com/tonguetoquill/quillify/issues/111)).
- A dynamic form is redrawn as pdf.js lays it out, which is not always as Acrobat shows it. On DAF 1288 the rows of Yes and No boxes sit up to two lines from the statements they answer ([#120](https://github.com/tonguetoquill/quillify/issues/120)). What a script or a data binding fills in at layout is missing: DD 2875's last page number, and the list of DAF 1288's two grade boxes, which come out as text fields ([#121](https://github.com/tonguetoquill/quillify/issues/121)). No dynamic form's redrawn page has been set beside the published form in Acrobat.
- A `zoom` on the host page reaches the frame a dynamic form is laid out in. The frame undoes it with a zoom of its own, and the form then reads as it does on a page with no zoom. Where it cannot, `sanitize` rejects with an error that names the zoom: a `zoom` marked `!important` on the frame, and a zoom whose reciprocal does not bring the product back to exactly 1, which is 57 of the 491 values from 0.10 to 5.00 in steps of 0.01, 1.7 among them. A browser that has `zoom` and no `Element.currentCSSZoom` still scales the layout with no error.
- A dropdown with `>`, `;` or `|` in an option reaches the quill as a string field, a text box where the published form has a dropdown, and the quill lists none of its options. The engine refuses those characters in an enum value ([#88](https://github.com/tonguetoquill/quillify/issues/88)). DAF 64 and AFMC 21 have one.
- A signature field of a static form reaches the quill as an unsigned widget and nothing more. What the published form says signing it locks, in an XFA manifest or a script, is not carried, and neither are the form's usage rights ([#124](https://github.com/tonguetoquill/quillify/issues/124), [`prose/research/SIGNING.md`](prose/research/SIGNING.md)). Whether a signature placed on a filled form validates has not been looked at ([#17](https://github.com/tonguetoquill/quillify/issues/17)).
- A layer that is off on screen or in print keeps its content in the background, and a reader that ignores optional content shows it ([#32](https://github.com/tonguetoquill/quillify/issues/32)).
- A radio group reaches the quill as one boolean per button, and so does a set of checkboxes that share a name and turn on as different values. Where two boxes of such a set turn on as one value, the file ticks both together and the quill has a boolean for each ([#41](https://github.com/tonguetoquill/quillify/issues/41)).
- A field gets a name and a description and no `title`, so an editor built on the quill shows a snake_case name where the form prints a label ([#36](https://github.com/tonguetoquill/quillify/issues/36)).
- Of a page's annotations the background keeps its links and no other, so a strikeout, a text box or a stamp left on a published form is not in it. A link stays only when it leads to an `http` or `https` address or to a place in the file ([#68](https://github.com/tonguetoquill/quillify/issues/68)).
- The strip holds every dictionary of a background to a table of keys: the catalog, the page tree, a page, a link, the layers, the structure tree and everything a page paints from. A test that walks each saved background against that table is v0.2.0 ([#25](https://github.com/tonguetoquill/quillify/issues/25)).
- A background keeps the published form's tags, with the text they carry that no page shows: alternate text, titles and IDs. The fields the engine stamps on it are in no structure element, so the fields of a form filled from a quill are untagged, and that is the engine's to change ([#192](https://github.com/tonguetoquill/quillify/issues/192)).

## Working on it

```
npm ci
npx playwright install --only-shell chromium
npm run gate
```

The gate is `npm run build`, Prettier, `tsc` and the tests, in node and in headless Chromium. [`CONTRIBUTING.md`](CONTRIBUTING.md) has how a change lands, and [`prose/research/`](prose/research/README.md) the research the XFA conversion rests on.

## Status

v0.1.0 is the importer of `tonguetoquill/web-app-afa-demo@842ef4207cb5` as a library, behind the four functions and their types above. The package is private and unlicensed, and installs from the tarball a [release](https://github.com/tonguetoquill/quillify/releases) attaches, beside its checksums and an SBOM. `npm run build && npm pack` makes the same tarball from a checkout. [`prose/DECISIONS.md`](prose/DECISIONS.md) has each of those choices and what would change it. [#2](https://github.com/tonguetoquill/quillify/issues/2) is the sequence to v0.2.0, which rebuilds a background from lists of what it may hold.
