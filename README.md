# quillify

Turn a published PDF form into a [Quillmark](https://github.com/borb-sh/quillmark) quill, in the browser.

Published forms rarely come as a clean fillable PDF. Most are encrypted with an empty password, and many are dynamic XFA: the file holds a "Please wait…" page and a template that only Acrobat lays out. quillify reads such a file and returns what Quillmark's `acroform` backend takes: the page as a background with its form layer stripped, and every field with its place.

57 of 59 federal forms and 1,143 of 1,354 Air Force forms convert, with every field read back at its place ([Measured](#measured)).

## Install

```
npm install @quillmark/quillify @quillmark/wasm
```

## Use

```ts
import { init } from '@quillmark/wasm';
import { quillify, sanitize, suggest } from '@quillmark/quillify';

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

`pdf` is the file's bytes as a `Uint8Array`. A test runs this block as printed.

| Function                 | What it does                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sanitize(pdf)`          | Parses the file: removes the encryption an empty password opens, lays a dynamic form out and redraws it as a static page, lists the fields and strips the form layer. |
| `suggest(fields)`        | Names each field from the form's own tooltips. No model.                                                                                                              |
| `check(fields, naming)`  | Lists what is wrong with a naming.                                                                                                                                    |
| `quillify(form, naming)` | Builds the quill's files (`Quill.yaml`, `form.json`, `form.pdf`, `example.md`) as a tree `Quill.fromTree` takes.                                                      |

A naming is `{ name, description, fields }`, and each entry of `fields` is `{ id, keep, name, description }` with an optional `example` and, on a text field, `text` (`line`, `paragraph` or `lines`). The review screen, any model that names fields and storage are the consumer's.

## What comes back

`sanitize` resolves to `{ ok: true, form }` or `{ ok: false, refusal }`. Nothing is thrown for a file it does not take.

A `Form` is `{ pdf, pages, fields }`: the background, the page sizes in points, and the fields. A `Field` has an `id`, its `places` (a zero-based `page` and a `rect` in points from the page's top left), `required`, `readOnly`, a `tooltip` when the form has one, and a `kind`:

| `kind`      | Also carries                                  |
| ----------- | --------------------------------------------- |
| `text`      | `multiline`, and `maxLength` when one is set  |
| `checkbox`  |                                               |
| `radio`     | `group`, and `on` when the file gives a value |
| `choice`    | `options`                                     |
| `signature` |                                               |

### Refusals

| `code`            | Carries                       | The file                                                  | A person can                            |
| ----------------- | ----------------------------- | --------------------------------------------------------- | --------------------------------------- |
| `too_large`       | `bytes`, `limit`              | is over 8 MiB, or decodes to over 64 MiB                  | do nothing                              |
| `too_slow`        | `limit`                       | still has a worker busy 60 s after the call               | try again on a quieter machine          |
| `not_pdf`         |                               | is not a PDF                                              | choose the right file                   |
| `password`        |                               | needs a password to open                                  | save a copy without it, and choose that |
| `encryption`      |                               | is encrypted in a way pdf.js does not read                | do nothing without the certificate      |
| `damaged`         |                               | opens, but cannot be rewritten or can be read in two ways | download it again                       |
| `portfolio`       | `attachment`                  | is a portfolio, whose form is an attachment               | save the attachment, and choose that    |
| `too_many_pages`  | `pages`, `limit`              | has more than 25 pages                                    | do nothing                              |
| `too_many_fields` | `fields`, `limit`             | has more than 1,000 fields                                | do nothing                              |
| `layout`          | `detail`                      | is a dynamic form pdf.js cannot lay out                   | do nothing                              |
| `no_fields`       | `xfa`                         | has no field                                              | do nothing: there is no box to fill     |
| `rotated`         | `page`                        | has a page that is still rotated                          | do nothing                              |
| `unpaintable`     | `page`, `construct`, `detail` | is a dynamic form with something the redraw does not draw | do nothing                              |

`construct` is `image`, `background_image`, `svg`, `border`, `transform`, `glyph`, `barcode` or `password`.

### Problems

`check` and `quillify` return the problems of a naming. A naming of the wrong shape is not one: it throws a `TypeError` that names the slot.

| `code`              | Carries                 | What is wrong                                |
| ------------------- | ----------------------- | -------------------------------------------- |
| `quill_name`        |                         | The quill's name is not snake_case           |
| `quill_description` |                         | The quill's description is empty             |
| `nothing_kept`      |                         | No field a person can fill is kept           |
| `unknown_field`     | `id`                    | An entry names a field the form lacks        |
| `unnamed_field`     | `id`                    | A field of the form has no entry             |
| `repeated_field`    | `id`                    | A field has two entries                      |
| `field_name`        | `id`                    | A kept field's name is not snake_case        |
| `duplicate_name`    | `name`                  | Two kept fields share a name                 |
| `text_on_non_text`  | `id`                    | `text` is set on a field that is not text    |
| `engine`            | `message`, `diagnostic` | The engine refused the files (from quillify) |

Every other string in a `Form`, a refusal or a problem (an id, a tooltip, an option, an engine message) is text from the file. Show it as text and trust none of it. [`SECURITY.md`](SECURITY.md) has the boundary.

## In an app

- **The bytes** of a chosen file: `new Uint8Array(await file.arrayBuffer())`.
- **Naming.** Between `suggest` and `quillify` a person, or a model, corrects the names, and `check` says what is wrong with the naming so far.
- **The engine.** `quillify` calls the engine's `init()` itself. A host that hands `init` a source of its own calls it before the first `quillify`.
- **Time.** Every measured form reads in under 3 s on a laptop. A read cannot be stopped ([#188](https://github.com/tonguetoquill/quillify/issues/188)), and one that still has a worker busy after 60 s is refused.
- **Weight.** Nothing loads until the first `sanitize`. Then the page fetches the pdf.js worker (2.2 MB), and for each file the qpdf worker and `qpdf.wasm` (1.3 MB). The fonts (1.65 MB) load for a dynamic form only.
- **Versions.** Before 1.0 a minor release may change what a consumer's code must do, and the changelog says how to move. A patch release does not, and adds no refusal code.

From the tree to a filled PDF, with `Engine` imported from `@quillmark/wasm`, `Quill` and `Document` from its `init()`, and `values` keyed by the naming's names:

```ts
const quill = Quill.fromTree(built.tree);
const doc = new Document(`${quill.metadata.name}@${quill.metadata.version}`);
quill.writer(doc).setAll(values);
const out = await new Engine().render(quill, doc, { format: 'pdf' });
const filled = out.artifacts[0].bytes;
```

## What it needs

- A browser for `sanitize`. Chromium is the one measured. `suggest`, `check` and `quillify` need no DOM.
- `@quillmark/wasm` 0.124.0 or later, as a peer.
- A bundler that follows `new URL('../assets/…', import.meta.url)`, as Vite does, so that it copies the seven files the package loads at run time: two workers, `qpdf.wasm` and four fonts ([#101](https://github.com/tonguetoquill/quillify/issues/101)).
- Under a content security policy, the page needs `worker-src 'self'`, `connect-src 'self'` and `img-src blob:`, and the response that serves `qpdf.worker.js` needs `'wasm-unsafe-eval'` in its `script-src` and `connect-src 'self'`. [`prose/research/USING_IT.md`](prose/research/USING_IT.md) has the table.

## Measured

| Set                        | Converts                                        | The rest                                                                         |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| 59 published federal forms | 57                                              | one has no field, one is a portfolio                                             |
| 1,354 Air Force forms      | 1,143, or 96% of the 1,190 with a field to fill | 17 over 1,000 fields, 16 the redraw does not draw, 14 with only read-only fields |

Each converted form was rendered by the engine, and every kept field was read back at its place. `npm run corpus` reruns the first set on a directory of the forms ([`corpus/`](corpus/README.md)), and [`prose/research/AF_EPUBS_SECOND_RUN.md`](prose/research/AF_EPUBS_SECOND_RUN.md) records the second, made at `53e01c8`. No page has been set beside Acrobat's ([#17](https://github.com/tonguetoquill/quillify/issues/17)).

## Limits

- **Size.** 8 MiB a file, 64 MiB decoded, 25 pages, 1,000 fields, 60 s. Past one, the file is refused with a code above. An image counts as stored, whatever its pixels come to ([#163](https://github.com/tonguetoquill/quillify/issues/163)).
- **A dynamic form is redrawn, not copied.** It is drawn as pdf.js lays it out, in Helvetica, Times or Courier, and no script of the form is run. What the layout stacks can come out stacked the other way ([#111](https://github.com/tonguetoquill/quillify/issues/111)), and pdf.js's layout is not always Acrobat's ([#120](https://github.com/tonguetoquill/quillify/issues/120), [#121](https://github.com/tonguetoquill/quillify/issues/121)).
- **Refused in a dynamic form:** a turned field, a dotted border, an SVG shape other than a line or a rectangle, a barcode or a password field, pictures of more than 8,000,000 pixels between them ([#42](https://github.com/tonguetoquill/quillify/issues/42)), and a character the standard fonts cannot encode ([#198](https://github.com/tonguetoquill/quillify/issues/198)).
- **Faces.** Text that asks for Arial or Helvetica is laid out in Liberation Sans, which the package ships. Any other face is laid out in what the machine has ([#197](https://github.com/tonguetoquill/quillify/issues/197)).
- **Signatures.** A signature field reaches the quill as an unsigned widget. What signing it locks is not carried ([#124](https://github.com/tonguetoquill/quillify/issues/124)).
- **Radio groups** reach the quill as one boolean a button ([#41](https://github.com/tonguetoquill/quillify/issues/41)), and a field gets a name and no title ([#36](https://github.com/tonguetoquill/quillify/issues/36)).
- **A dropdown** with `>`, `;` or `|` in an option becomes a text field ([#88](https://github.com/tonguetoquill/quillify/issues/88)).
- **The background** keeps a page's links to an `http` or `https` address or to a place in the file, and no other annotation ([#68](https://github.com/tonguetoquill/quillify/issues/68)). It keeps a layer that is off ([#32](https://github.com/tonguetoquill/quillify/issues/32)) and the form's tags, and the fields stamped on it are untagged ([#192](https://github.com/tonguetoquill/quillify/issues/192)).
- **Zoom.** A `zoom` on the host page that the layout frame cannot undo exactly makes `sanitize` reject with an error that names it.

[`SECURITY.md`](SECURITY.md) says what a hostile file can and cannot do.

## Develop

```
npm ci
npx playwright install --only-shell chromium
npm run gate
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) has how a change lands, [`prose/canon/ARCHITECTURE.md`](prose/canon/ARCHITECTURE.md) how the code is laid out, [`prose/DECISIONS.md`](prose/DECISIONS.md) why each rule is what it is, and [`CHANGELOG.md`](CHANGELOG.md) what changed.

## License

Apache-2.0. [`NOTICE`](NOTICE) lists the third-party files the package ships.
