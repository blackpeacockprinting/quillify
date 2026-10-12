# Fixtures

Nine blank published forms, byte for byte, and one sample that `scripts/make-acroform-fixture.js` writes.

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

Locked means AES-128 under the empty user password. Fields are counted as the inventory counts them: each radio button is one, and a field painted in two places is one.

## Add one

1. Put the file here unchanged, with nothing a person entered.
2. Add its entry to `MANIFEST.json`, with its URL and the date checked ([#53](https://github.com/tonguetoquill/quillify/issues/53)).
3. Add its row above, and for a published form its inventory to [`../goldens/`](../goldens).

`test/fixtures.test.ts` holds each file to its hash, and `test/canon.test.ts` each row to the manifest and the golden. A hostile input is no fixture: its test builds it.
