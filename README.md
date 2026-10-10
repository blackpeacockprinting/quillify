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

`pdf` is the file's bytes as a `Uint8Array`. A test runs this block as it is printed.

`sanitize` is where every byte of the file is parsed. It removes the encryption, converts a dynamic form to a static one, lists the fields and strips the form layer. `suggest` names each field from the form's own tooltip, or from its field name when it has none, and keeps every field a person can fill. Its result is a starting point: the names are what a person or a model corrects before the quill is built, and `check(fields, naming)` lists the problems of a naming that it can find without the engine. `quillify` runs `check`, writes the files and shows them to the engine, whose own refusals come back from `quillify` alone. `built.tree` is a `Map` from `Quill.yaml`, `form.json` and `form.pdf` to their bytes, with `example.md` when a kept field has an example to show. `ok` means `Quill.fromTree` took the tree, and that call reads `Quill.yaml` alone. The engine first reads the background and `form.json` when the caller opens or renders a document.

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

A file the library does not take is refused with a value, and nothing is thrown for it. Ten of the 59 forms are refused, so a caller meets this branch often.

| `code`            | It carries                                          | The file                                                                    |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `too_large`       | `bytes`, `limit`                                    | is over 8 MiB                                                               |
| `not_pdf`         |                                                     | is not a PDF                                                                |
| `password`        |                                                     | needs a password to open                                                    |
| `encryption`      |                                                     | is encrypted in a way pdf.js does not read, such as to a certificate        |
| `damaged`         |                                                     | opens, and qpdf cannot rewrite it                                           |
| `portfolio`       | `attachment`, when it has a name                    | is a portfolio, whose form is an attachment                                 |
| `too_many_pages`  | `pages`, `limit`                                    | has more than 20 pages                                                      |
| `too_many_fields` | `fields`, `limit`                                   | has more than 200 fields                                                    |
| `no_fields`       | `xfa`                                               | has no field; `xfa` is true when it holds an XFA form that nothing laid out |
| `rotated`         | `page`                                              | has a page that is still rotated once qpdf has flattened what it can        |
| `unpaintable`     | `page`, `construct`, and `detail` when there is one | is a dynamic form with something on a page that the redraw does not draw    |

`construct` is one of `image`, `background_image`, `svg`, `border`, `transform` and `glyph`. `detail` is the SVG element, the border style or the text that could not be drawn. The library has no sentence for a code: the caller maps `code` to its own words.

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

Outside `code`, `kind`, `construct` and `diagnostic`, a string in a `Form`, a refusal, a suggested naming or a problem is text from the file or from the naming handed in: a field's `id`, a tooltip, an option, whatever the engine's `message` quotes. Show it as text and trust none of it. [`SECURITY.md`](SECURITY.md) has the boundary, what the background keeps and what is not handled.

## What it does to a PDF

1. **Normalize.** qpdf, compiled to WebAssembly, removes the encryption an empty password opens, folds page rotation into the page and joins each page's content streams.
2. **Convert.** For a dynamic form, pdf.js lays the XFA template out in a sandboxed frame, whose document takes no rule from the host page and gives it none, and the layout is redrawn as a static PDF with an AcroForm field where each XFA field sat.
3. **Inventory.** Each widget is read: its kind, its page and rect, its flags and its tooltip.
4. **Strip.** pdf-lib removes the form layer. Of the catalog, of each page and of each link, a named set of keys stays, and every object nothing reaches is dropped.
5. **Assemble.** `Quill.yaml` and `example.md` are written from the naming and `form.json` from the places, and the background goes in as `form.pdf`.

[`prose/research/XFA_INTERNALS.md`](prose/research/XFA_INTERNALS.md) has how the conversion works. [`prose/DECISIONS.md`](prose/DECISIONS.md) has what was decided at each stage and what would unlock a different answer.

## What it leaves to the consumer

- The interface, including the screen where a person reviews and corrects field names.
- Any model. Names come from the form's own tooltips, or from whatever the consumer supplies.
- Storage, and what happens to a quill once it is built.

## What it needs

- A browser, for `sanitize`. A dynamic form is laid out by the browser, in a hidden frame of no size that is in the host page's body while a file converts, and the pdf.js worker and qpdf's binary load as a browser loads them ([#34](https://github.com/tonguetoquill/quillify/issues/34)). `suggest`, `check` and `quillify` need no DOM.
- `@quillmark/wasm` 0.124.0 or later, as a peer.
- A bundler that follows `new URL('../assets/…', import.meta.url)`, which is how the build finds the pdf.js worker and the `qpdf.wasm` it ships. Vite 8.3 is the one bundler measured ([#101](https://github.com/tonguetoquill/quillify/issues/101)).

## Measured

- **Ten files in the gate.** Nine published forms and one synthetic go through `sanitize`, `suggest` and `quillify`. The engine renders each quill, and every kept field is read back from the rendered PDF on the page and at the rect `form.json` gives.
- **59 published federal forms.** 49 convert. The engine renders each, and a field is read back at each of the 3,670 places `form.json` gives. Ten are refused: eight hold more than 200 fields, one has no field and one is a portfolio. [`corpus/`](corpus/README.md) names the forms, and `npm run corpus` reruns the measurement on a directory of them.
- **The page under the form layer.** With annotations not drawn, the gate has pdf.js paint each of the ten files' 29 pages twice, as the strip was given it and as the background, and holds the two to the same pixels. A dynamic form's page there is the redraw. Outside the gate, Poppler compared the 1,792 stored pages of 1,395 published PDFs at 60 dpi, inside the crop box and with annotations hidden, and found none changed. For a dynamic form the stored page is its placeholder page.
- **1,354 PDFs from the Air Force's form lists.** 798 convert. They hold 54,492 fields, and every kept one was read back in place. 157 have no field, 14 of them a notice the site serves in place of a form it does not publish, and 4 are portfolios, each a cover page around a rights-managed attachment that nothing here opened. Of the other 1,193, 67% convert, and the 200-field cap is the largest reason for the rest, at 230 files. The run was made once, on the library at `465a328`, with a runner outside the repository. [`prose/research/AF_EPUBS_FORMS.md`](prose/research/AF_EPUBS_FORMS.md) has its tables, and [`corpus/af-epubs.manifest.json`](corpus/af-epubs.manifest.json) one line per file.

## Limits

- A form over 20 pages or 200 fields is refused ([#40](https://github.com/tonguetoquill/quillify/issues/40)). Both caps are read once a dynamic form has been laid out in full ([#29](https://github.com/tonguetoquill/quillify/issues/29)), and the 8 MiB cap bounds the file as stored, whatever its streams inflate to ([#30](https://github.com/tonguetoquill/quillify/issues/30)).
- `sanitize` has no deadline, and one published form, DAF 1024, never finishes ([#86](https://github.com/tonguetoquill/quillify/issues/86)). A few files end it with an error where they should be read or refused ([#77](https://github.com/tonguetoquill/quillify/issues/77), [#80](https://github.com/tonguetoquill/quillify/issues/80), [#84](https://github.com/tonguetoquill/quillify/issues/84), [#85](https://github.com/tonguetoquill/quillify/issues/85)).
- A dynamic form with an image or a dashed border is refused ([#42](https://github.com/tonguetoquill/quillify/issues/42)), and so is one whose text holds a character the standard fonts cannot encode, most often a tab ([#87](https://github.com/tonguetoquill/quillify/issues/87)). One that converts is redrawn in Helvetica, Times or Courier, whatever face it was published in ([#44](https://github.com/tonguetoquill/quillify/issues/44)), and its signature fields are left out with their captions ([#43](https://github.com/tonguetoquill/quillify/issues/43)).
- A `zoom` on the host page reaches the frame a dynamic form is laid out in and scales its layout, with no error. On DD 2875 at a zoom of 1.5, the fields move by up to 0.03 pt, the text of the redrawn page by up to 1.02 pt, and a 1 pt border is redrawn at 0.67 pt ([#95](https://github.com/tonguetoquill/quillify/issues/95)). A host page that removes the frame before it has loaded leaves `sanitize` pending ([#99](https://github.com/tonguetoquill/quillify/issues/99)).
- By the code's reading, with no test yet, a crop box that reaches past its MediaBox on the left or the top moves every field on the page off its box ([#28](https://github.com/tonguetoquill/quillify/issues/28)). A page that names its `/Type` by reference is cut from the background, and `form.json` still places fields on it ([#69](https://github.com/tonguetoquill/quillify/issues/69)).
- A dropdown with `>`, `;` or `|` in an option builds only with that field dropped ([#88](https://github.com/tonguetoquill/quillify/issues/88)). A control character such as U+007F in a tooltip or an option is written raw into `Quill.yaml`, where the engine refuses it and `check` does not see it coming ([#89](https://github.com/tonguetoquill/quillify/issues/89)).
- A radio group reaches the quill as one boolean per button ([#41](https://github.com/tonguetoquill/quillify/issues/41)). Two checkboxes of one name and two on-states come back as one checkbox, so one answer ticks both ([#81](https://github.com/tonguetoquill/quillify/issues/81)).
- A field gets a name and a description and no `title`, so an editor built on the quill shows a snake_case name where the form prints a label ([#36](https://github.com/tonguetoquill/quillify/issues/36)).
- Of a page's annotations the background keeps its links and no other, so a strikeout, a text box or a stamp left on a published form is not in it. A link stays only when it leads to an `http` or `https` address or to a place in the file ([#68](https://github.com/tonguetoquill/quillify/issues/68)).
- The strip keeps a named set of keys of the catalog, the page tree, each page and each link, and does not read what a kept key holds: under a page's resources, the structure tree and the layers, the background has whatever the file put there. Reading those against lists of names, and the trailer with them, is v0.2.0 ([#25](https://github.com/tonguetoquill/quillify/issues/25)).

## Working on it

```
npm ci
npx playwright install --only-shell chromium
npm run gate
```

The gate is `npm run build`, Prettier, `tsc` and the tests, in node and in headless Chromium. [`CONTRIBUTING.md`](CONTRIBUTING.md) has how a change lands, and [`prose/research/`](prose/research/README.md) the research the XFA conversion rests on.

## Status

Nothing is released, and a tarball is `npm run build && npm pack`. [#1](https://github.com/tonguetoquill/quillify/issues/1) is the sequence to v0.1.0, which is the importer of `tonguetoquill/web-app-afa-demo@842ef4207cb5` as a library. The four functions and their types are a proposal until [#3](https://github.com/tonguetoquill/quillify/issues/3) is settled. The license ([#4](https://github.com/tonguetoquill/quillify/issues/4)) and the package's name and registry ([#5](https://github.com/tonguetoquill/quillify/issues/5)) are undecided, so the package is private and unlicensed.
