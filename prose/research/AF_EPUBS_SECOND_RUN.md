# Air Force forms from e-Publishing, the second run

11 October 2026. The library at `53e01c8` went over the same 1,354 files as the first run. [`AF_EPUBS_FORMS.md`](AF_EPUBS_FORMS.md) has how they were pulled on 10 October, what they are and what the library at `465a328` did with them. No file was fetched again: each was held to the size and the SHA-256 the manifest records. [`corpus/af-epubs.manifest.json`](../../corpus/af-epubs.manifest.json) now holds this run's outcome for each file, and `git show v0.2.0:corpus/af-epubs.manifest.json` prints the first run's.

## What the library does with them

Each file went through `sanitize`, `suggest` and `quillify`. The engine rendered each quill that built, with nothing filled in, and every kept field was read back from the rendered PDF.

| Outcome | Departmental | Other lists | All | First run, all |
| --- | --- | --- | --- | --- |
| Converted, every kept field read back at its place | 792 | 351 | 1,143 | 798 |
| `no_fields` | 148 | 12 | 160 | 157 |
| `too_many_fields` | 10 | 7 | 17 | 230 |
| `unpaintable` | 12 | 4 | 16 | 132 |
| A problem from `quillify` | 0 | 14 | 14 | 16 |
| `portfolio` | 4 | 0 | 4 | 4 |
| An error thrown | 0 | 0 | 0 | 16 |
| Not finished | 0 | 0 | 0 | 1 |

The 1,143 that convert hold 159,870 fields on 1,916 pages: 135,905 text fields, 16,683 check boxes, 3,442 choices, 2,021 signature fields and 1,819 radio buttons. 885 are dynamic, 241 hybrid and 17 plain. The largest has 999 fields (AETC 667) and the longest 19 pages (AF 1174). 249 have more than 200 fields.

1,190 of the 1,354 have a field to fill, taking out the 160 with none and the 4 portfolios. 96% of those convert, and 97% of the Departmental list's 814.

The slowest file took 2.3 s from the start of `sanitize` to the last field read back, and the 1,354 took 702 s between them, one at a time on one machine with other work running beside them.

## What moved since the first run

| First run | Second run | Files |
| --- | --- | --- |
| Converted | Converted | 798 |
| `too_many_fields` | Converted | 219 |
| `unpaintable` | Converted | 107 |
| An error thrown | Converted | 16 |
| A problem from `quillify` | Converted | 2 |
| Not finished | Converted | 1 |
| `unpaintable` | `too_many_fields` | 6 |
| `unpaintable` | `no_fields` | 3 |
| The same refusal or problem in both | | 202 |

No file that converted in the first run is refused in the second.

What changed in the library between the two, by the pull request that changed it:

- The caps went from 20 pages and 200 fields to 25 and 1,000 (#201).
- A tab in a dynamic form's text ends a run of text, where it refused the form (#202).
- A dynamic form's pictures, its captions turned by quarters and its dashed borders are redrawn, where each refused the form (#211, #212, #213).
- The 16 errors and the form that did not finish were answered in v0.2.0, and so were the 2 problems, each a dropdown with `;`, `>` or `|` in an option.
- The 3 files now refused for having no field were refused for a picture before the count of fields was reached.

Converted forms also differ from the first run's in what they hold. A dynamic form keeps its signature fields and their captions (#205) and a field whose control pdf.js writes nothing for (#206), prints the page number a layout script writes (#208), is laid out in Liberation Sans where it asks for Arial or Helvetica (#209), and is one field where its template holds a field twice at one place (#210).

## What is still refused

The 47 files with a field to fill that do not convert, each with its reason.

**More than 1,000 fields, 17.** The engine takes 1,000 fields in a block, and the cap stops where the engine does. AETC 668 (2,039), AF 4116 (1,920), AMC 312 (1,753), AF 1460 (1,385), AETC 325 (1,263), AETC 41 (1,165), ACC 772 (1,152), AF 4145 (1,140), AF 4076 (1,122), AF 1464 (1,117), PACAF 413 (1,105), AF 1163 (1,088), AF 1165 (1,087), AF 4024 (1,055), DAF 7514 (1,026), AMC 85 (1,026) and AF 3521 (1,009).

**A character the standard fonts lack, 11** (#198). U+25B2, a triangle: DAF 4392, DAF 673, DAF 898 and DAF 978. U+25BC, a triangle: AETC 9 and AFRC 207. U+03BC, mu: AF 1457. U+2010, a hyphen: DAF 57. U+2191, an arrow: DAF 102. U+2192, an arrow: DAF 1089A. U+20DD, an enclosing circle: AF 4336, which #198 does not list.

**A turn the redraw does not make, 4** (#42). A turned field on AF 3000, AF 3616 and AFGSC 215, and a caption turned in a cell that a row or a column flows on DAFCOMSEC 4167.

**An SVG ellipse, 1** (#42). AFGSC 73.

**Only read-only fields, 14.** `quillify` answers `nothing_kept`: AETC 341, AFMC 1651 to 1656, AFMC 1651A to 1656A and AFMC 1661. They stay as they are.

The 160 with no field are the 157 of the first run and the 3 above. The 4 portfolios are AF 3070A to D.

## The redraw beside its layout

The gate's comparison of a redraw with its layout (#110) was run over the 885 dynamic forms that convert, 1,481 pages, by a probe outside the repository, with the text left out of both pictures. 711 forms match their layout and 174 differ, on 234 pages. The six looked at differ the way #111 names: a fill and a border or a rule stacked the other way round.

Of the 605 forms compared before, when the corners were rounded (#204), 601 have the counts they had. Three differ more, AFMC 21, AF 529 and AFGSC 264, each at a box sized by its text, and a bisect puts the change at #209. Since then a form is laid out in Liberation Sans, and the comparison's picture of the layout is an SVG image, which cannot load that face (#214). That reading is from the diagnostic and was not confirmed by a run with the faces in the picture.

## What this does not say

- The run was made once, on one machine, by a runner that is not in the repository. It took the files one at a time and recorded what each ended in.
- A converted form was rendered with nothing filled in. No value was typed into any of them, no page was looked at, and none was opened in Acrobat (#17).
- The read-back holds a field to its place, its name and its kind. It says nothing of what the page under the fields looks like.
- What a later revision of a form does is unknown. The manifest's hash names the bytes that were measured, and the URL may serve others by now.
