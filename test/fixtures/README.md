# Fixtures

Ten PDFs: nine blank published forms, byte for byte, and one built here.

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
| `DAF1288_Application_for_Ready_Reserve_Assignment.pdf`            | DAF 1288  | dynamic | yes    | 2     | 121    |
| `acroform-sample.pdf`                                             | synthetic | plain   | no     | 1     | 5      |

A locked file is encrypted with AES-128 under the empty user password. Fields are counted as the inventory counts them: each radio button is one, and a field painted in two places is one. A dynamic form's pages and fields are what the conversion lays out.

## What each is here for

- **DD 1610**: the locked file the normalize test loads, and the form the README's code runs on.
- **DD 577**: a radio group of twelve and four signature fields.
- **DD 689**: the small hybrid form.
- **SF 144**: JBIG2 scans for pages, and a crop box inside its first page's media box.
- **SF 1152**: every field painted twice (30 fields, 60 places), a thumbnail on each page, and an author named in its metadata ([#55](https://github.com/tonguetoquill/quillify/issues/55)).
- **SF 182**: nine pages, thirteen dropdowns, five signature fields, four embedded fonts.
- **DD 2875**: the dynamic form the geometry tests read.
- **DAF 988**: the most fields, and a template that sets `xfa-font-horizontal-scale`.
- **DAF 1288**: 26 radio buttons in nine groups. pdf.js loads it only with the shipped worker's guard.
- **`acroform-sample.pdf`**: written by `scripts/make-acroform-fixture.js`. A rerun writes new dates and a new hash.

The first page of DD 1610, DD 577, SF 144, SF 1152 and SF 182 is eight content streams. `qpdf --check` warns about the linearization hint tables of the first four and of DD 689.

## Add one

1. Put the file here, unchanged: nothing a person entered, nothing added or removed, the publisher's own metadata included.
2. Add its entry to `MANIFEST.json`, with its URL and when it was checked. Five entries have none ([#53](https://github.com/tonguetoquill/quillify/issues/53)).
3. Add its row to the table above, and for a published form its inventory to [`../goldens/`](../goldens).

`test/fixtures.test.ts` holds each file to its hash, and `test/canon.test.ts` each row above to the manifest and the golden.

A hostile input is no fixture: it is built in its test. The sample's link stores its address as a name, which is malformed ([#56](https://github.com/tonguetoquill/quillify/issues/56)).
