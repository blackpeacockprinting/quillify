# Acceptance

11 October 2026, UTC. Two things were checked before a first release, with the library at `98aba25`: that the app the importer came from can use it as a package, and that a form it built opens as a form to fill. The first is measured. The second is measured in two readers, looked at as renders, and left open in the three viewers a person has to open.

## The exit test

The importer was carried from `tonguetoquill/web-app-afa-demo@842ef4207cb5`. That repository has a script, `scripts/measure-forms.mjs`, that drives the app's own "Build a format" dialog in headless Chromium: it hands the dialog each PDF, waits for the fields step or a refusal, continues, uses the format and downloads the filled PDF. The test is to put the package where the importer was and get the same answer from that script, on the 59 forms [`corpus/manifest.json`](../../corpus/manifest.json) names. The app runs as its preview does, with no model key, so its naming model is the mock it ships.

### What was changed

In a scratch clone of the fork:

- The package and its engine were installed: the tarball that `npm run build && npm pack` writes at `98aba25` (963,424 bytes, SHA-256 `39cdb0dc851cddd555508488a511bd018ab36a8320415c7faf8fe315df7bebc7`), and `@quillmark/wasm` at 0.124.0, the floor of the package's peer range. The fork pins 0.122.0.
- One source file was edited, `src/lib/components/PdfImportWizard/wizard.svelte.ts`, by 128 lines added and 41 removed: [`exit-test.diff`](exit-test.diff). The wizard calls `sanitize` where it called the fork's `normalizePdf`, `xfaToAcroForm`, `inventoryPdf` and `stripAcroForm`, `quillify` where it called `assembleQuill`, and `check` for the reason its fields step cannot continue. It keeps the app's sentence for ten of the eleven refusal codes. `unpaintable` has one sentence where the app had six, and the app's refusal of pages that raster too large has no code, since the package makes no raster. The 59 forms show three of the eleven: too many fields, a portfolio and no field.

Nothing else changed: no Vite setting, no plugin, no copy step. The build copies the package's worker and `qpdf.wasm` byte for byte, and `svelte-check` passes with the change in place (5,644 files, no error, no warning).

### The result

| | The fork as it is | With the package |
| --- | --- | --- |
| Exported | 49 | 49 |
| Refused | 10 | 10 |
| Fields the dialog lists to name, over the 49 | 3,668 | 3,668 |
| Pages in the exports | 143 | 143 |
| Fields in the exports | 3,670 | 3,670 |
| Bytes in the exports | 6,302,653 | 6,297,469 |

Form by form, all 59 rows agree: in the outcome, in the number of fields the dialog lists, and in the pages and fields pdf-lib reads back from the export. The ten refusals show the same words, down to the count of fields and the name of the attachment in them.

The exports are not the same files. 14 of the 49 are the same bytes, and 21 differ in size, by between 5,353 bytes fewer and 3,671 more. Three things differ in what they hold:

- **Eight example values.** Read back with qpdf, the fields of 45 exports are the same in page, name, type, rect, value, tooltip and state. The other four differ in eight example values, each without the trailing space the app's importer left on it. The package trims an example.
- **Three borders.** Drawn by Poppler at 60 dpi, 139 of the 143 pages are the same pixels. On AF 4324's first page the app's importer draws a box around each of three signature fields whose border the template marks hidden. By the code, the cause is where the form is laid out: the app's importer does it in the app's own page, whose stylesheet gives every element a solid border style, and pdf.js writes a hidden border's width and color with no style of its own. The package lays the form out in a frame of its own and draws none.
- **A few glyphs.** DAF 988's first two pages differ in some glyphs on three lines of text. SF 2809's page 17 shows three of the trimmed values.

Moving the engine alone changes none of the 59 rows. The fork as it is, on 0.124.0, gives the same rows as on 0.122.0 and exports of the same sizes, 33 of which differ in the trailer's `/ID` and nothing else. It adds one console error, below.

### Under the app's policy

The preview serves each page with this header:

```
content-security-policy: default-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'nonce-…'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Four forms were run again, as far as the built format, with the page listening for `securitypolicyviolation`: DAF 1288, DD 577, SF 182 and DD 2875. None fired on the host document. While a file is read the page requests two script chunks of the app's build, the app's own pdf.js worker, the package's `qpdf.wasm`, the package's worker twice, and the app's naming route. The window also caught nine thumbnails of the app's template picker. The frame the package puts in the body has `sandbox="allow-same-origin"`, is hidden and has no size, and is gone by the time the fields step shows.

### The guard reaches the app through the package

The fork patches pdf.js after install so that DAF 1288 loads, and stops its own build when the patch is missing. A package's consumer gets no such patch. With the fork's patch reversed in `node_modules` and that build check removed:

| | DAF 1288 | The 59 forms |
| --- | --- | --- |
| The fork's own importer | fails: "Cannot read properties of undefined (reading 'length')" | not run |
| With the package | exported, 116 fields | the same 59 rows as above |

In that build the app's own worker is built from an unpatched `pdfjs-dist`, and the package's worker is the file the tarball carries, byte for byte.

### What the swap costs the app

- No page raster goes to the naming route. The package makes none (#35), so a hosted model would name from the inventory alone. The mock reads no raster.
- A `Form` does not say whether a choice drops down or lists, nor what a checkbox's on-state is called, both of which the app's inventory did. The swap sends `combo: false` and no on-state for a checkbox.
- The app zips a quill under its version. The package writes 0.1.0 into every quill and exports no name for it, so the swap repeats the number.
- The app reads the document a PDF carries with its own pdf.js, and now reads it from the file as given: the package hands back no normalized bytes.
- The fields step now stops on a blank description, which the package calls a problem, and the swap gives it a sentence the app did not have.
- One console error appears that the fork as it is does not show: the editor fails to render a tip's markdown. It appears with the engine moved to 0.124.0 and no package installed, probed on DD 577 and DAF 1288, so it is the app's to meet when it moves engines (#6).

### What this does not show

A hosted model's naming. A bundler other than Vite 8.3 (#101). The app's own test suites, which were not run. Anything in the app off the path the script drives.

### To repeat it

In a clone of the fork at `842ef4207cb5`, with the 59 forms in a directory and the preview served with no model key:

```
npm ci
npm run build
ANTHROPIC_API_KEY= OPENAI_API_KEY= npm run preview &         # on 4173
node scripts/measure-forms.mjs before.json <corpus>

git apply <quillify>/prose/research/exit-test.diff
npm install --save-exact --min-release-age=0 @quillmark/wasm@0.124.0 <quillify>/quillify-0.0.0.tgz
npm run build                                                # then the preview again
node scripts/measure-forms.mjs after.json <corpus>
```

Each JSON file holds one row a form: `stage`, `fields`, `exportPages`, `exportFields`, and for a refusal the `words` shown. The fork's `.npmrc` holds a release back for seven days, which is why the engine's install names `--min-release-age=0`.

## A filled form in a viewer

The ten fixtures went through the app with the package in it: each was built into a quill, filled with the mock's example values and downloaded. What two readers make of a filled form is measured. What Acrobat, Preview and Chrome's viewer show was not looked at.

The readers were pdf.js 6.3.289 in headless Chrome for Testing 153.0.8010.12, PDFKit on macOS 27.2 (26B5101f) and Poppler 26.08.0.

### pdf.js

`src/engine-pdfjs.browser.test.ts` is in the gate. For each fixture it builds the quill with the library, has the engine render it with a value in every text field, and opens the result with pdf.js, the reader in Firefox. It holds: the pages `sanitize` counted; no XFA and a first page that does not say "Please wait"; no encryption and no permission bits; no document script and no open action; one field object for each place of each field a person can fill, none hidden and none with an action, every one but a signature editable; and the value it was given in each text widget, at every place a field is painted. It does not read a script on a page or on a link, which the strip's own tests hold.

### PDFKit

PDFKit is the framework under Preview. A Swift script outside the repository opened the app's ten exports with it and counted the widgets on each page:

| Form | Pages | Widgets | Text | Button | Choice | Signature |
| --- | --- | --- | --- | --- | --- | --- |
| DD 1610 | 3 | 45 | 27 | 16 | 0 | 2 |
| DD 577 | 1 | 34 | 18 | 12 | 0 | 4 |
| DD 689 | 1 | 21 | 9 | 10 | 0 | 2 |
| SF 144 | 2 | 42 | 33 | 9 | 0 | 0 |
| SF 1152 | 4 | 60 | 60 | 0 | 0 | 0 |
| SF 182 | 9 | 84 | 66 | 0 | 13 | 5 |
| DD 2875 | 3 | 78 | 60 | 13 | 5 | 0 |
| DAF 988 | 3 | 159 | 105 | 54 | 0 | 0 |
| DAF 1288 | 2 | 116 | 54 | 57 | 5 | 0 |
| synthetic | 1 | 5 | 3 | 1 | 1 | 0 |

PDFKit opens all ten. None is encrypted or locked, each allows form entry, no widget lies outside its page, and no first page says "Please wait". The counts are a widget for each place of each field a person can fill: a read-only field is left out of a quill, so DD 1610, DD 577 and SF 144 have fewer widgets than fields, and SF 1152 has two for each field. The three dynamic forms have no signature widget because a dynamic form's signature fields are not carried (#43).

### Looked at

The eight pages of the three dynamic fixtures' filled forms were rendered with Poppler at 150 dpi and with PDFKit, and read as images in two passes, in the sessions that wrote and checked this record. No person has looked at them in a viewer. Nothing here sets a page beside the published form as Acrobat shows it, which is the only reference a dynamic form has. A screenshot of pdf.js's own layout was set beside three of the eight: page 1 of DAF 988, page 1 of DAF 1288 and page 3 of DD 2875.

On each page the form's rules are drawn and each example value is in its field, and each page can be read. None would pass for the published form. What the two passes found, by cause:

**Left out by the conversion.**

- Nine captions of signature fields, with the fields (#43): 11, 17d, 18a, 19b and 25 on DD 2875, and 20, 28, 31 and 34 on DAF 1288. The cell each sat in is empty.
- The numbers in DD 2875's page 3 footer, which reads "Page of". They are two hidden fields a script fills at layout, and pdf.js runs no script (#121).
- The lists of DAF 1288's two grade boxes, which come out as text fields. pdf.js lays them out with no option (#121).

**Drawn off its place by the redraw.**

- The square of every check box and radio button on the three forms, 124 in all. It is drawn at the top of a box taller than it is wide, where the layout centers the control, so it sits 1.7 to 5.3 pt above its label's line (#119). On DAF 988 the square for "Graduation (J)" is over the word "Absence".

**As pdf.js lays the form out.** The screenshots show each of these on the three pages they cover. The other five pages were not set beside a layout.

- On both pages of DAF 1288 the rows of Yes and No boxes part from the statements they answer, where a line is 12 pt: by up to 15 pt on page 1, with the row for the closing certification 24 pt off and across a rule, and by up to 14 pt on page 2 (#120). On page 1 the boxes for one statement sit on the line of the heading above it.
- Text on a rule: the last question of block A and the last line of block B on DAF 1288 page 1, the last row of labels in block 8 on DAF 988 pages 1 and 2, the last line of DAF 988 page 3, "PRIVACY ACT STATEMENT" on DD 2875 page 1, and "26. VERIFICATION DATE" against the rule above it on page 2.
- Text over other text: the "II" of "SECTION II" on DAF 988 pages 1 and 2, the last word of "PRIVACY ACT STATEMENT" on its page 1, and "REQUIRED?" of block 52 on DAF 1288 page 2, which is over its Yes box.
- Text past its box: the certification paragraph on DAF 988 pages 1 and 2, on both sides, a line of the Privacy Act statement on page 1, and "Comments:" on page 3.

pdf.js lays DAF 988 and DD 2875 out in a fallback serif, since neither names a face this machine has (#44). DAF 1288's styles compute to Times New Roman and Arial Narrow, which it has, so its pages are in their own faces. Whether DAF 988's two headings would fit in Arial was not tried.

### Not looked at

| Viewer | What to look for |
| --- | --- |
| Acrobat DC | Each file opens as a form to fill, with no "Please wait" page, no security or rights banner and no script prompt. On the three dynamic forms each field sits on its box. A value typed into a field stays after a save and reopen |
| Preview | The same |
| Chrome's viewer | The same |

The published dynamic forms were not opened in Acrobat either, so nothing above says how far a redrawn page is from the one a person knows. Whether Acrobat keeps or drops the usage rights of the published file, and whether a signature placed on a filled export validates, are not looked at. #17 stays open for these.
