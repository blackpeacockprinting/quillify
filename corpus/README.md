# Corpus

59 published federal forms the library is measured on. `manifest.json` names each by its SHA-256. Nine are the fixtures in `test/fixtures`, and the other fifty are kept outside git ([#16](https://github.com/tonguetoquill/quillify/issues/16)).

## Run it

```
QUILLIFY_CORPUS=<directory that holds the PDFs> npm run corpus
```

- The directory must hold every form of the manifest and no other `.pdf`, a later revision of a form included. The run checks this first.
- Keep `#`, `?` and `%` out of the directory's path: the test server answers 404 under them.
- The run is no part of the gate or of CI. The gate holds the manifest's totals (`manifest.test.ts`).

Each form goes through `sanitize`, `suggest` and `quillify`. The background is walked against the strip's table, the engine renders the quill blank, and each field is read back at the name, page and rect `form.json` gives. The run stops at the first form whose outcome is not the manifest's, and prints what it got.

## What it measures

57 convert, every form that has a field: 6,686 fields on 197 pages, at 6,589 places. A read-only field is not placed, and a field shown in more than one box is placed in each. Two are refused: SF 85 has no field, and AF 3070A is a portfolio.

## The manifest

One form per line: its number, size, hash, `kind`, `encryption`, `outcome`, the counts of a form that converts, and its `url` where one is on record.

| `kind`    | Forms | What the file holds                                                                                          |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| `plain`   | 14    | An AcroForm and no XFA                                                                                       |
| `hybrid`  | 26    | An XFA packet beside an AcroForm field tree                                                                  |
| `dynamic` | 17    | An XFA template, no field tree, and `/NeedsRendering` in the catalog: a viewer lays the pages out on opening |
| `none`    | 2     | No form field: the portfolio and SF 85                                                                       |

38 of the 59 are encrypted with an empty user password: 35 with AES-128, one with AES-256 and two with RC4.

17 lines carry the URL that served those bytes on 10 October 2026. The others have none on record, so a copy fetched today may be a later revision.

## The Air Force files

`af-epubs.manifest.json` is a second list: 1,354 PDFs from the Air Force's form lists, with what the library did with each. 1,143 convert. `npm run corpus` does not read it, and the gate holds its totals (`af-epubs.test.ts`). [`prose/research/AF_EPUBS_FORMS.md`](../prose/research/AF_EPUBS_FORMS.md) has how the files were pulled, and [`prose/research/AF_EPUBS_SECOND_RUN.md`](../prose/research/AF_EPUBS_SECOND_RUN.md) the run the list records.
