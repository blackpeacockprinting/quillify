# Fixtures

Ten PDFs. Nine are blank published forms, kept byte for byte as they were collected, and one is built here. `MANIFEST.json` records each file's form number, where it came from, its kind, its encryption and its SHA-256. `test/fixtures.test.ts` fails when a file's SHA-256 is not the one its entry records, or when a file has no entry or an entry no file. `test/canon.test.ts` holds the table below to the manifest and the goldens.

| File                                                              | Form      | Kind    | Locked | Pages | Fields |
| ----------------------------------------------------------------- | --------- | ------- | ------ | ----- | ------ |
| `DD1610_Request_and_Authorization_for_TDY_Travel.pdf`             | DD 1610   | hybrid  | yes    | 3     | 46     |
| `DD577_Appointment_Termination_Record.pdf`                        | DD 577    | hybrid  | yes    | 1     | 35     |
| `DD689_Individual_Sick_Slip.pdf`                                  | DD 689    | hybrid  | yes    | 1     | 21     |
| `SF144_Statement_of_Prior_Federal_Service.pdf`                    | SF 144    | plain   | no     | 2     | 44     |
| `SF1152_Designation_of_Beneficiary_Unpaid_Compensation.pdf`       | SF 1152   | plain   | yes    | 4     | 30     |
| `SF182_Authorization_Agreement_and_Certification_of_Training.pdf` | SF 182    | plain   | no     | 9     | 84     |
| `DD2875_System_Authorization_Access_Request.pdf`                  | DD 2875   | dynamic | no     | 3     | 85     |
| `DAF988_Leave_Request_Authorization.pdf`                          | DAF 988   | dynamic | yes    | 3     | 166    |
| `DAF1288_Application_for_Ready_Reserve_Assignment.pdf`            | DAF 1288  | dynamic | yes    | 2     | 122    |
| `acroform-sample.pdf`                                             | synthetic | plain   | no     | 1     | 5      |

A locked file is encrypted with AES-128 and opens with the empty user password. The fields are the entries of a form's inventory: each radio button is one, and a field painted in two places is one. For a dynamic form the pages and fields are what the conversion lays out: the file itself stores one "Please wait" page and no field. [`../goldens/`](../goldens) has the inventory of each published form, field by field.

Five of the nine store their first page as eight content streams: DD 1610, DD 577, SF 144, SF 1152 and SF 182.

## What each is here for

- **DD 1610** is the locked file the normalize test loads with pdf-lib before qpdf and after, and the form the README's code block is run on.
- **DD 577** has a radio group of twelve, which the radio-binding test reads, and four signature fields.
- **DD 689** is the small hybrid form: one page, one content stream.
- **SF 144** is not encrypted, and its pages are JBIG2 scans. Its first page has a crop box inside its media box, by 0.72 pt on three sides and 0.48 pt at the top.
- **SF 1152** paints every field twice, an original and a file copy over one field tree: 30 fields at 60 places. It is published with a thumbnail on each page, and its metadata names its author ([#55](https://github.com/tonguetoquill/quillify/issues/55)).
- **SF 182** is the long one, at nine pages, with thirteen dropdowns and five signature fields. It embeds four fonts, one of which a test borrows.
- **DD 2875** is the dynamic form the geometry tests read: its golden, a fixed rect, and the host-page tests.
- **DAF 988** is the largest, at 166 fields, and its template sets `xfa-font-horizontal-scale` six times.
- **DAF 1288** has 26 radio buttons in nine groups, and it is the form pdf.js does not load without the guard the shipped worker carries.
- **`acroform-sample.pdf`** was written by `scripts/make-acroform-fixture.js`: three text fields, a checkbox, a dropdown and a link. A rerun writes new dates into the file, and so a new hash.

## Where they came from

`MANIFEST.json` has a publisher for each published form, and a URL and the time it was checked for four: SF 144 and SF 1152 at opm.gov, DAF 988 and DAF 1288 at the Air Force's e-Publishing site. Each of the four served the fixture's bytes on 10 October 2026 (UTC). The other five have no URL on record ([#53](https://github.com/tonguetoquill/quillify/issues/53)).

## Rules

A published fixture is a blank form, byte for byte as published. Nothing a person entered into a form goes into one, and nothing is added or removed: what a publisher left in its own file's metadata stays, because removing it would end the identity with the published file.

A hostile input is no fixture. It is built in its test, from bytes. The sample's link, which stores its address as a name, is the one input a fixture was built with malformed ([#56](https://github.com/tonguetoquill/quillify/issues/56)). Five published fixtures are malformed as published: `qpdf --check` warns that the linearization hint tables of DD 1610, DD 577, DD 689, SF 144 and SF 1152 do not match the file.
