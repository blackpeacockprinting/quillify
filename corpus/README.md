# Corpus

The library is measured on 59 published federal forms, 24 MB of them. `manifest.json` names each by its SHA-256. Nine are the fixtures in `test/fixtures`. The other fifty are kept outside git ([#16](https://github.com/tonguetoquill/quillify/issues/16)). They were collected for `tonguetoquill/web-app-afa-demo`, and this repository's author holds the copies.

```
QUILLIFY_CORPUS=<directory that holds the PDFs> npm run corpus
```

The run takes each form through `sanitize`, `suggest` and `quillify`, and has the engine render the quill with nothing filled in. It reads the fields back from the rendered PDF and holds each to the name, the page and the rect `form.json` gives it. Then it holds the outcome to the manifest's: `converted` with the counts of pages, fields and places, or a refusal's code. It stops at the first form that differs and prints the refusal or the problems it got.

Before any form it checks the directory against the manifest, and stops if a form is missing or if the directory holds a file whose name ends in `.pdf` that the manifest does not name. A later revision of a form is such a file. Keep `#`, `?` and `%` out of the directory's path: the test server answers 404 for a file under `#` or `?`, and under a `%` that does not begin an escape.

17 lines of the manifest carry the URL that served those bytes on 10 October 2026. No URL was recorded for the others when they were collected, so a copy fetched today may be a later revision.

The run needs the files, so it is no part of the gate and never runs in CI. The gate holds the manifest's own totals.

## What it measures

49 convert: 12 of the 14 plain forms, 21 of the 26 hybrid and 16 of the 17 dynamic, 3,727 fields on 143 pages. A read-only field is not placed, and a field the form shows in more than one box is placed in each, so `form.json` gives 3,670 places. The engine stamps a field at every one, within a hundredth of a point of its rect. Ten are refused:

- Eight hold more than 200 fields: AF 1466, DD 448, DD 1966, N-400, OF 178, OF 1164, SF 75 and VA 21-526EZ. The cap is [#40](https://github.com/tonguetoquill/quillify/issues/40).
- SF 85 has no field.
- AF 3070A is a portfolio: a cover page around an attachment named `MicrosoftIRMServices Protected PDF.pdf`.

## The manifest

One form per line: its number, its size in bytes, its hash, its `kind` and its `encryption`, both read with qpdf, its `outcome`, the counts of pages, fields and places of a form that converts, and its `url` where one is on record.

| `kind`    | Forms | What the file holds                                                                                          |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| `plain`   | 14    | An AcroForm and no XFA                                                                                       |
| `hybrid`  | 26    | An XFA packet beside an AcroForm field tree                                                                  |
| `dynamic` | 17    | An XFA template, no field tree, and `/NeedsRendering` in the catalog: a viewer lays the pages out on opening |
| `none`    | 2     | No form field: the portfolio and SF 85                                                                       |

38 of the 59 are encrypted with an empty user password: 35 with AES-128, one with AES-256 and two with RC4.

The forms are Department of Defense and Department of the Air Force forms, Standard and Optional Forms, and forms of the IRS, the VA, USCIS, the Department of Labor and the Executive Office for Immigration Review.

## The Air Force files

`af-epubs.manifest.json` is a second list: the 1,354 PDFs pulled from the Air Force's form lists on 10 October 2026, one per line: the form's number, title, prescribing publication, format and date as the index gives them, its list, its URL and when it was fetched, its size and hash, its kind and encryption, and what the library did with it. [`prose/research/AF_EPUBS_FORMS.md`](../prose/research/AF_EPUBS_FORMS.md) has how they were pulled and the tables. A test in the gate holds the list's totals.

`npm run corpus` does not read this list. In the run the manifest records, 17 of its files ended `sanitize` with an error or never finished ([#80](https://github.com/tonguetoquill/quillify/issues/80), [#84](https://github.com/tonguetoquill/quillify/issues/84), [#85](https://github.com/tonguetoquill/quillify/issues/85), [#86](https://github.com/tonguetoquill/quillify/issues/86)), and a run that expects that is no check. Since then the three of #85 convert, and the 12 of #84 no longer end with an error: nine convert and three are refused for their field count. The list keeps all of them as the run found them. The run that measured them is not in the repository.
