# Air Force forms from e-Publishing

10 October 2026, UTC. The library at `465a328`, with the corpus run and its read-back on top, went over the 1,354 files pulled from the Air Force's Product Index. [`corpus/af-epubs.manifest.json`](../../corpus/af-epubs.manifest.json) has one line per file: what the index says of the form, where and when the file was fetched, its size and SHA-256, its kind and encryption, and the outcome. `corpus/af-epubs.test.ts` holds it to what the tables here take from it: the lists, the kinds, the encryption, the outcomes, and each count by construct, by problem and by `xfa`. The files are not in the repository.

## What was pulled

The Product Index at `e-publishing.af.mil` lists forms by organization, and each row links a PDF on `static.e-publishing.af.mil`. The pull took public pages only, with no login, in an ordinary Chrome window on a throwaway profile. Each list was read by clicking through the site's own menus and reading the table the page renders. Each file was then read with `fetch()` from a second tab, open on the file host, one every five seconds, set to stop at the first 403 or 429. Neither came: all 1,359 requests answered 200. A headless browser was refused with a 403 on its first request, and nothing was done about that beyond using an ordinary one. The site's `robots.txt` disallows `/DesktopModules/`, which is where the index page sends its own listing requests at each click. The pull made no request to that path itself.

| List | Files |
| --- | --- |
| Departmental | 966 |
| Air Education and Training Command | 122 |
| Air Force Materiel Command | 92 |
| Air Force Global Strike Command | 58 |
| Air Mobility Command | 44 |
| Air Force Special Operations Command | 21 |
| Air Force Reserve Command | 20 |
| Air Combat Command | 16 |
| United States Air Force in Europe-AF Africa | 5 |
| Air National Guard | 4 |
| Space Force, two lists | 4 |
| Pacific Air Force | 2 |

The Departmental list is complete. The index lists 1,227 departmental forms. 251 are physical products whose link is one shared notice, which was fetched once. 6 link no PDF: two an XFDL file, one a spreadsheet and three nothing. The other 970 listings and that notice came to 966 files, because five listings link a file name that another listing also links. Four of the five were the same bytes as the file that replaced them. The fifth, AF 4352A's `generic_restricted.pdf`, differed, and was overwritten before it was measured. The pull stopped in the USAFE list, at 5 of 74, when the directory reached the 500 MiB it was allowed. The other eight major commands are complete. The rest of the USAFE list (67 files), the lead commands, the direct reporting units, the field operating agencies, the numbered air forces, the special series, the bases and the units were not pulled.

Fourteen of the 1,354 files are no form. Where the index lists a product it does not publish (restricted, for official use only, controlled unclassified information, a physical product, one its office stocks and issues, or one kept in another system), the link leads to a one-page notice that says so and where to ask. On the lists read, 324 listings link a notice, and 306 of those link the one for a physical product. The notices were fetched nineteen times. Five of the fourteen sit under a form's own file name, so the name does not give them away. They were found by reading the first page of each of the 157 files with no field. The manifest marks each with `"notice": true`, under the number and title of the listing whose fetch left it on disk.

That leaves 1,340 files that are forms. Every listing whose link is a notice was served the notice, and nothing came from behind a login. Four of the 1,340, AF 3070A to D, are cover pages around an attachment that the file declares encrypted with Microsoft's rights management. Nothing here opened it.

## What the files are

| Kind | Departmental | Other lists | All |
| --- | --- | --- | --- |
| `dynamic`: the catalog sets `/NeedsRendering`, the file stores one placeholder page, and the fields exist only in the XFA template | 702 | 244 | 946 |
| `hybrid`: an XFA template beside a field tree | 128 | 135 | 263 |
| `plain`: an AcroForm and no XFA | 16 | 1 | 17 |
| `none`: no form field | 120 | 8 | 128 |

The Departmental list is 73% dynamic, against 29% of the 59 federal forms. For these forms the XFA conversion is the main path.

87 of the 128 files with no field hold an XFA packet all the same. It has no `<field>`, the catalog does not set `/NeedsRendering`, and the pages are stored as ordinary page content. The first scan of these files counted them as dynamic, which put the Departmental list at 81%. pdf.js lays an XFA form out when the catalog sets `/NeedsRendering` and the file has no field tree, or a tree of signature fields alone, which no file here has. That is the rule the table above uses.

1,282 of the 1,354 are encrypted and open with the empty user password: 1,271 with AES-128, 6 with AES-256 and 5 with RC4. None is over the 8 MiB cap, and the largest is 5.0 MiB.

## What the library does with them

Each file went through `sanitize`, `suggest` and `quillify`. The engine rendered each quill that built, with nothing filled in, and every kept field was read back from the rendered PDF.

| Outcome | Departmental | Other lists | All |
| --- | --- | --- | --- |
| Converted, every kept field read back at its place | 559 | 239 | 798 |
| `too_many_fields` | 143 | 87 | 230 |
| `no_fields` | 145 | 12 | 157 |
| `unpaintable` | 101 | 31 | 132 |
| A problem from `quillify` | 1 | 15 | 16 |
| An error thrown | 12 | 4 | 16 |
| `portfolio` | 4 | 0 | 4 |
| Not finished after 180 s | 1 | 0 | 1 |

The 798 that convert hold 54,492 fields on 1,229 pages. The engine stamped a field at every place `form.json` gives, within a hundredth of a point, and no other.

157 files have no field and 4 are portfolios, whose form is an attachment the library does not open. Of the other 1,193, 798 convert: 67%. By kind that is 590 of 913 dynamic forms, 194 of 263 hybrid and 14 of 17 plain.

What stands in the way of the other 395, largest first:

| Files | What | Issue |
| --- | --- | --- |
| 230 | More than 200 fields. The counts run from 201 to 2,039, with a median of 346.5. A cap of 500 would take 170 of them, and 1,000 would take 219. | #40 |
| 65 | An image on a dynamic form's page | #42 |
| 57 | A character the standard fonts cannot encode. In 39 of them the forty characters the refusal carries hold a tab. | #87, #44 |
| 14 | Every field is read-only, so `suggest` keeps none and `check` returns `nothing_kept` | #3 |
| 12 | pdf-lib refuses a name when the redrawn form's fields are created: nine "a field already exists", three "periods in PDF field names" | #84 |
| 10 | A transform (7), a dashed border (2) or an SVG element (1) on a dynamic form's page | #42 |
| 3 | pdf.js ends the open with `Cannot read properties of undefined (reading 'length')` | #85 |
| 2 | A dropdown row with `>` in it (DAF 64) or `;` (AFMC 21), which the engine refuses in an enum | #88 |
| 1 | pdf.js had not finished opening DAF 1024 after 180 s | #86 |
| 1 | pdf-lib ends the read of AF 1520 with `Expected instance of PDFName, but got instance of undefined` | #80 |

What the 157 with no field are:

| Files | What the file is | `xfa` on the refusal |
| --- | --- | --- |
| 87 | An XFA packet with no field, on stored pages | `true` |
| 33 | A dynamic form whose layout holds no field | `false` |
| 19 | A PDF with text and no form | `false` |
| 14 | A notice | `false` |
| 4 | A page with no text layer | `false` |

## What this does not say

- The run was made once, on one machine, by a runner that is not in the repository. It recorded a thrown error and a timeout as outcomes, where `npm run corpus` stops at the first form that differs.
- A converted form was rendered with nothing filled in. No value was typed into any of them, and none was opened in Acrobat.
- The 20-page cap refused nothing here. The longest form that converts has 11 pages.
- What a later revision of a form does is unknown. The manifest's hash names the bytes that were measured, and the URL may serve others by now.
- How many files the other lists hold is unknown. The index names 11 lead commands, 4 direct reporting units, 27 field operating agencies, 25 numbered air forces, 2 special series, 101 bases and 175 units, and a list's size is known only once it is read.
- The results do not carry the commit they were made on. `465a328` is from the notes of the session that ran them.
