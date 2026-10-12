# Limits

## Measured

| Set                        | Converts | The rest                                                                                   |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| 59 published federal forms | 57       | no field (1), a portfolio (1)                                                              |
| 1,354 Air Force forms      | 1,143    | no field (160), over 1,000 fields (17), not drawable (16), read-only (14), a portfolio (4) |

Each converted form was rendered by the engine and every kept field read back at its place. `npm run corpus` reruns the first set. No page has been compared with Acrobat by eye ([#17](https://github.com/tonguetoquill/quillify/issues/17)).

## Bounds

8 MiB a file, 64 MiB decoded, 25 pages, 1,000 fields, 14,400 pt a side of a page, 60 s, and in a dynamic form 8,000,000 pixels of pictures. Past one, the file is refused.

## A dynamic form is redrawn

It is drawn as pdf.js lays it out, in Helvetica, Times or Courier, and a mark those lack in Symbol or ZapfDingbats. No script of the form runs.

- A hairline under half a point, or a rule half a point from a fill, can come out a pixel off its layout.
- pdf.js's layout is not always Acrobat's ([#120](https://github.com/tonguetoquill/quillify/issues/120)).
- Arial and Helvetica are laid out in Liberation Sans, which the package ships. Other faces use what the machine has ([#197](https://github.com/tonguetoquill/quillify/issues/197)).
- Refused: a turned field, a field off its page, a dotted border, an SVG shape other than a line or a rectangle, a barcode or password field ([#42](https://github.com/tonguetoquill/quillify/issues/42)), and a character no standard font holds.

## Every form

- A signature field becomes an unsigned widget. What signing locks is not carried ([#124](https://github.com/tonguetoquill/quillify/issues/124)).
- A radio group reaches the quill as one boolean a button ([#41](https://github.com/tonguetoquill/quillify/issues/41)), and a field has a name and no title ([#36](https://github.com/tonguetoquill/quillify/issues/36)).
- A dropdown with `>`, `;` or `|` in an option becomes a text field ([#88](https://github.com/tonguetoquill/quillify/issues/88)).
- The background keeps links to `http`, `https` or a place in the file, and no other annotation ([#68](https://github.com/tonguetoquill/quillify/issues/68)). It keeps a layer that is off ([#32](https://github.com/tonguetoquill/quillify/issues/32)), and its stamped fields are untagged ([#192](https://github.com/tonguetoquill/quillify/issues/192)).
- A `zoom` on the host page that the layout frame cannot undo exactly makes `sanitize` reject with an error that names it.
