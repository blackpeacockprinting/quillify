# Viewers

11 October 2026, local time. [`ACCEPTANCE.md`](ACCEPTANCE.md) left three viewers not looked at. Two of them can be driven by a script with no window, and this is what each made of ten filled forms: PDFKit, the framework under Preview, and the PDF viewer built into Chrome. Acrobat was not opened. No person opened Preview or Chrome, so what is here is what the two engines do, read from their answers and from images.

## What was run

The ten files are filled forms: the nine published fixtures and the generated sample, each built into a quill, rendered by the engine with an example value in each text field that has one ("Example" and the field's name) and no box ticked. They were written on 10 October 2026 at 22:04 local time, and the commit they were built at is not recorded with them. Each of the 124 check boxes and radio buttons of the three dynamic forms is square in them, so they were built with the change of #119 in. `qpdf --check` finds no fault in any of the ten.

| Form | Bytes | SHA-256, first 12 |
| --- | --- | --- |
| DD 1610 | 39,888 | `10dd4d6fe592` |
| DD 577 | 21,230 | `d5068f509779` |
| DD 689 | 12,552 | `4bf674962a77` |
| SF 144 | 144,199 | `4766380c0169` |
| SF 1152 | 141,897 | `ee345059f7be` |
| SF 182 | 265,035 | `d52f78254fc4` |
| DD 2875 | 45,239 | `32d828571fa4` |
| DAF 988 | 82,501 | `f4edf105bffd` |
| DAF 1288 | 52,212 | `bac065b4c7fb` |
| synthetic | 3,014 | `bfa39e268cee` |

The machine was macOS 27.2 (26B5101f), a beta. PDFKit is the one it ships, driven by a script run with Swift 6.4. Chrome's viewer is the one in Chrome for Testing 153.0.8010.12, the full build that Playwright 1.63.0 installs as `chromium-1243`, driven from Node 24.15.0. The files were also read with qpdf 12.4.0, and images compared with Pillow 12.2.0.

Every page is US Letter but SF 144's two, which are 612 by 790.08 pt.

## PDFKit

A Swift script outside the repository, for each file: opens it with `PDFDocument`, reads `isEncrypted`, `isLocked`, `allowsFormFieldEntry` and the page count, and counts the widget annotations of each page by `widgetFieldType`. It draws each page to a PNG at 100 dpi (`PDFPage.draw(with: .mediaBox, to:)` into a white bitmap). On each page it then takes the first annotation that is a text widget, in the order PDFKit lists them, and sets its `widgetStringValue` to `x`. It writes the document to a scratch directory with `PDFDocument.write(to:)`, opens that copy, reads the value of the first text widget of each page back, and draws each page of the copy the same way.

| Form | Pages | Widgets | Text | Button | Choice | Signature | Pages with a text widget | `x` read back |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD 1610 | 3 | 45 | 27 | 16 | 0 | 2 | 1, 2 | 2 of 2 |
| DD 577 | 1 | 34 | 18 | 12 | 0 | 4 | 1 | 1 of 1 |
| DD 689 | 1 | 21 | 9 | 10 | 0 | 2 | 1 | 1 of 1 |
| SF 144 | 2 | 42 | 33 | 9 | 0 | 0 | 2 | 1 of 1 |
| SF 1152 | 4 | 60 | 60 | 0 | 0 | 0 | 1, 3 | 2 of 2 |
| SF 182 | 9 | 84 | 66 | 0 | 13 | 5 | 1, 2 | 2 of 2 |
| DD 2875 | 3 | 78 | 60 | 13 | 5 | 0 | 1, 2 | 2 of 2 |
| DAF 988 | 3 | 159 | 105 | 54 | 0 | 0 | 1, 2, 3 | 3 of 3 |
| DAF 1288 | 2 | 116 | 54 | 57 | 5 | 0 | 1, 2 | 2 of 2 |
| synthetic | 1 | 5 | 3 | 1 | 1 | 0 | 1 | 1 of 1 |

PDFKit opens all ten. None is encrypted or locked, each allows form entry, no widget is read-only or lies outside its page, and no first page's text says "Please wait". The counts are those `ACCEPTANCE.md` has for the app's exports.

A value was set on 17 of the 29 pages, the ones with a text widget. `write(to:)` returned true for each file, each copy opened with the pages and widgets of its source, and each of the 17 widgets read back as `x` under the name it had.

### What the save does

The 12 pages where nothing was set draw to the same pixels from the copy as from the file as opened. On the other 17 every pixel that differs is inside the rect of the widget that was set, or, on five pages of three of the four forms with choice fields, inside the rect of a choice field, whose value PDFKit draws again.

The copy is not a clean file. While it writes, CoreGraphics logs "writeStream: Failed to get data from stream" once for each button widget, and `qpdf --check` on the copy warns of an empty object for each one: 57 on DAF 1288, 54 on DAF 988, 16 on DD 1610, 13 on DD 2875, 12 on DD 577, 10 on DD 689, 9 on SF 144, 1 on the synthetic form and none on the two forms with no button. In the synthetic form, read as text, the cause is the appearance the engine gives a box that is not ticked, a stream of no bytes: PDFKit writes the copy without it. The other nine were counted and not read. `qpdf --check` also warns of one stream with no `/Length` for each value that was set, which in the synthetic form is a font PDFKit embeds for the value. PDFKit opens its own copy all the same. No other reader was given a copy.

### Looked at

Read as images in the session that wrote this record: the first page of each of the ten copies, and every page of the three dynamic forms, 15 pages of the 29. The other 14 were not looked at: pages 2 and 3 of DD 1610, 2 of SF 144, 2 to 4 of SF 1152 and 2 to 9 of SF 182. The renders of the files as opened were compared with the copies by pixel and not looked at.

PDFKit draws a field's value in black with no tint and no border, and a choice field as its value with no arrow. On every page looked at the `x` is in the box it was set in, and each value sits in the printed box of its field.

| Form | Seen |
| --- | --- |
| DD 1610, page 1 | The form, with `x` in block 1. The values of blocks 6 and 7 are cut off at the bottom of their boxes, and the values beside "RATE PER MILE" and of block 13 are drawn across the rule under them |
| DD 577 | The form, with `x` in block 1. Nothing out of place |
| DD 689 | The form, with `x` in block 1. Nothing out of place |
| SF 144, page 1 | A page of printed text with no field, as published |
| SF 1152, page 1 | The form, with `x` in the name. The value of "Location" is cut off at the bottom of its box and the one beside "Total =" after two letters |
| SF 182, page 1 | The form, with `x` beside "a. Tuition and Fees". Nothing out of place |
| DD 2875, pages 1 to 3 | The form, with `x` in the user ID and in block 20. Each check box's square is on its label's line. The value of block 16a is cut off at half its height, and of block 7 after its first line. "PRIVACY ACT STATEMENT" is on a rule and the page 3 footer reads "Page of", as `ACCEPTANCE.md` records (#121) |
| DAF 988, pages 1 to 3 | The form, with `x` in block 1 of each page. Each check box's square is on its label's line. The provider's value is cut off at the right of its box. The text over text and past its box that `ACCEPTANCE.md` records is there |
| DAF 1288, pages 1 and 2 | The form, with `x` in block 2 and in block 22. The rows of Yes and No boxes are parted from their statements, as recorded (#120). In block 12 two values are drawn one over the other, below |
| synthetic | The title, five labels and four values, with `x` for the full name. The check box has no printed square, so nothing shows where it is |

A value that is cut off is an example value longer than its box: the examples are field names. What PDFKit does with a value that fits was seen only for `x`.

## Chrome's viewer

A Node script outside the repository launches the full Chromium build headless through Playwright (`launchPersistentContext` with `headless: true` and the build's own executable, which is the new headless mode), with a new profile directory in scratch, a viewport of 1100 by 1300, and the flags `--disable-background-networking`, `--disable-component-update`, `--no-first-run`, `--disable-sync`, `--disable-default-apps` and `--host-resolver-rules=MAP * ~NOTFOUND`. For each file it listens for `dialog`, `popup`, `console` and `pageerror` on the tab, and then:

1. Opens the file by its `file:` URL, waits four seconds and takes a screenshot.
2. Clicks at (1080, 700), on the page and right of every field, presses Tab, types `x` and takes a second screenshot.
3. Seven more times presses Tab and types `x`, and takes a third.
4. For each later page, opens the URL with `#page=n` in a new tab and takes a screenshot.
5. In a new tab, clicks the middle of the first text widget of page 1, at the rect PDFKit gave for it, presses Meta+A, types `x` and takes a fourth screenshot. At the 97% the viewer picks for this viewport a Letter page has its corner at (304.3, 59) and 1.2933 px to the point. SF 144 has no text widget on page 1 and no fourth screenshot.

No window was on the screen. A second script asked `CGWindowListCopyWindowInfo` every 15 seconds through the run, 11 times: Chrome for Testing owned five windows each time and none was on screen. The only requests the browser context saw were the file itself, the viewer's own pages under `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai` and `chrome://resources`.

For all ten files: the response was 200, no dialog opened, no popup, no console message and no page error. The viewer shows its toolbar (the file's name, the page number, the zoom, buttons to fit, rotate, draw, undo and redo, and four more at the right) and a strip of page thumbnails. It shows no banner and no bar of its own on any screenshot looked at, and no "Please wait" page.

| Form | Drawn | First Tab stop | What `x` did there | By the third screenshot | `x` over the first text field of page 1 |
| --- | --- | --- | --- | --- | --- |
| DD 1610 | The form | The link "Joint Travel Regulations (JTR)" in the printed text | Nothing | `x` at the head of seven text fields, blocks 1 to 7 | Shows, block 1 |
| DD 577 | The form | The first link of the Privacy Act statement | Nothing | `x` at the head of five text fields, blocks 1 to 5, and a focus ring on the first check box | Shows, block 1 |
| DD 689 | The form | The check box "ILLNESS" | A focus ring, no tick | Both boxes of block 1 ticked, `x` at the head of six text fields | Shows, block 1 |
| SF 144 | Page 1, printed text | The name on page 2, a text field | `x` before the example value | The viewer has scrolled to page 2: `x` at the head of six text fields and both boxes of block 4 ticked | No text field on page 1 |
| SF 1152 | The form | The name, a text field | `x` before the example value | `x` at the head of eight text fields | Shows, the name |
| SF 182 | The form | "a. Tuition and Fees", a text field | `x` before the example value | `x` at the head of eight text fields, the two cost tables | Shows |
| DD 2875 | The form | The marking dropdown in the page 1 footer | Nothing to see | `x` at the head of five text fields | Shows, the user ID |
| DAF 988 | The form | The check box "Convalescent (F)" | A focus ring, no tick | Seven boxes of block 8 ticked, each tick inside its square, and a focus ring on an eighth | Shows, block 1 |
| DAF 1288 | The form | Block 2, a text field with no example | `x` | `x` in eight text fields | Shows, block 2 |
| synthetic | The form | The full name, a text field | `x` before the example value | Not looked at | Shows |

A check box that has the focus when `x` is typed shows a ring and no tick in the next screenshot, and a tick once the focus has moved on. On the two forms whose first stop is a link, typing `x` asked for nothing: the request list holds no address but the three kinds above.

### Looked at

Chrome tints each field light blue, so where a field is shows on every page. On every screenshot looked at each field is on its printed box and each value in its field. Where an example value is longer than its box Chrome draws it smaller or on more lines, and where it still does not fit, cuts it off at the right. The viewer draws the three dynamic forms' pages with the same flaws the PDFKit renders show: the parted rows on DAF 1288, "Page of" on DD 2875, the text over text on DAF 988, and the two values in block 12 of DAF 1288.

Of the 58 screenshots, these were read as images: the first of the synthetic form, DD 2875 and SF 144, the second of the synthetic form and DD 2875, the third of every form but the synthetic one, the later pages of the three dynamic forms (five), and the part of each fourth around the field that was clicked. The first and second of each file were also compared by pixel: they differ only inside one box, the first Tab stop's.

Not looked at: the later pages of DD 1610, SF 144, SF 1152 and SF 182 in Chrome, 14 screenshots, and the third screenshot of the synthetic form.

## Two fields on one box

Block 12 of DAF 1288, "DUTY AFSC/SFSC", shows two example values drawn one over the other in both viewers. The filled form has two text widgets there, `p1.Page1.form1.DAFSC` and `p1.Page1.form1.DAFSC#2`, with the same rect, [39.41 451.2 131.11 467.53]. A script that reads the widgets with qpdf finds that pair and no other among the ten files: no other two widgets of one page overlap by more than half the smaller. `test/goldens/DAF1288.inventory.json` holds both fields at one rect, so it is what the conversion has always made of this form. Why the form has two was not looked at (#137).

## The images

They are outside the repository, in `quillify-corpus/acceptance/viewers/` beside the ten files:

- `pdfkit/`: 58 PNGs, `<file>.pdfkit.asopened.p<n>.png` for each page as opened and `<file>.pdfkit.p<n>.png` for each page of the saved copy, and `pdfkit.json`, one row a file with what the script read.
- `chrome/`: 58 PNGs, `<file>.chrome.1.png` to `.4.png` for the four steps and `<file>.chrome.p<n>.png` for each later page, and `chrome.json` with the version, the requests and one row a file.
- `scripts/`: the two scripts, the one that lists windows, the one that finds overlapping widgets and the one that compares the images.

The copies PDFKit saved were left in scratch.

### To repeat it

```
swift pdfkit.swift <out>/pdfkit <acceptance>/*.pdf
WORKTREE=<a checkout with node_modules> node chrome.mjs <out>/chrome <out>/pdfkit/pdfkit.json <acceptance>/*.pdf
python3 compare.py <out>/pdfkit <out>/chrome
python3 -I overlap.py <acceptance>/*.pdf
```

The Chrome script takes Playwright from the checkout and the browser from `~/Library/Caches/ms-playwright/chromium-1243`. It reads `pdfkit.json` for each file's page count and for the rect of the first text widget of page 1.

## Not looked at

| Viewer | What is left |
| --- | --- |
| Acrobat DC | All of it: the last table of `ACCEPTANCE.md` stands as written for Acrobat |
| Preview | The application. PDFKit opens, fills, saves and draws each file with no window. Preview's own window, any banner it shows and what a person sees while typing were not seen |
| Chrome | The browser with a window and a person. The viewer was driven headless: no value was saved from it and read back, no box was clicked with the mouse, no dropdown was opened, and no signature field was touched |

In neither viewer was a choice changed, a signature field tried or more than one character typed. A check box was ticked in Chrome only, and by the keyboard. The 14 later pages of the four static forms with more than one page were drawn by both and looked at in neither. PDFKit's saved copy was opened by PDFKit alone.

The published dynamic forms were not opened in any viewer, so nothing here says how far a redrawn page is from the one a person knows. #17 stays open for Acrobat.
