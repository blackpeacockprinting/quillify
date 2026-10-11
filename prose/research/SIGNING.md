# Signing

11 October 2026, UTC. What the nine published fixtures carry about signing, what the Air Force's dynamic forms carry, and what a filled form built from a fixture carries. Read with qpdf 12.4.0 and OpenSSL 3.6.3, by scripts outside the repository. No signature was made or verified here, and no certificate chain was validated.

## Usage rights on the published forms

Each of the nine has a usage-rights signature at `/Perms /UR3`. [`XFA_INTERNALS.md`](XFA_INTERNALS.md) has the mechanism and what breaks it. Each is a detached PKCS #7 signature (`adbe.pkcs7.detached`, filter `Adobe.PPKLite`) with one signer, and its byte range runs from the start of the file to its end with one gap, which is the signature.

| Form | Dated (`/M`) | Signer | Rights |
| --- | --- | --- | --- |
| DD 1610 | 2026-07-07 | G3 | A |
| DD 577 | 2026-09-01 | G3 | A |
| DD 689 | 2022-09-28 | P23 | A |
| SF 144 | 2011-09-29 | P23 | A |
| SF 1152 | 2012-01-19 | P23 | A |
| SF 182 | 2021-04-12 | Profile 24 | B |
| DD 2875 | 2026-04-14 | G3 | C |
| DAF 988 | 2026-04-23 | G3 | C |
| DAF 1288 | 2025-09-15 | G3 | C |

- **A.** Annotations: create, delete, modify, copy, import, export. Document: full save. Form: add, fill in, delete, submit standalone. Signature: modify.
- **B.** As A, with the form rights cut to fill in.
- **C.** As A, without the annotation rights.

Each signature holds three certificates: the signer's, which its one `SignerInfo` names by serial number, the one that certificate names as its issuer, and a root that is its own issuer.

| Signer | Certificate | Issuer | Root | Signer valid |
| --- | --- | --- | --- | --- |
| G3 | ARE Production V8.1 G3 P24 1007657 | Adobe Product Services G3 | Adobe Root CA G2 | 2022-10-26 to 2035-12-31 |
| P23 | ARE Acrobat Product v8.0 P23 0002337 | Product Services | Adobe Root CA | 2006-06-20 to 2023-01-08 |
| Profile 24 | Adobe Profile 24 ARES 8.1 Unlimited Comment PunchCard 4326 | Product Services - G2 | Adobe Root CA | 2019-10-01 to 2023-01-08 |

Adobe Root CA's own validity ended on 9 January 2023. The four forms under it are dated before that.

`sanitize` rewrites the file, so the published byte range no longer holds, and the strip keeps six keys of the catalog, of which `/Perms` is not one. A quill's background has no usage rights, and neither has a form filled on it.

## Signature fields on the published forms

| Form | AcroForm signature fields | `/SigFlags` | XFA signature fields |
| --- | --- | --- | --- |
| DD 1610 | 2 | 3 | 2 |
| DD 577 | 4 | 3 | 4 |
| DD 689 | 2 | 3 | 2 |
| SF 144 | 0 | 2 | no XFA |
| SF 1152 | 0 | 2 | no XFA |
| SF 182 | 5 | 3 | no XFA |
| DD 2875 | 0 | 3 | 7 |
| DAF 988 | 0 | 3 | 7 |
| DAF 1288 | 0 | 3 | 6 |

`/SigFlags` holds two bits, which the PDF standard names `SignaturesExist` (1) and `AppendOnly` (2). The three dynamic forms set the first over an empty `/Fields`.

None of the 13 AcroForm signature fields has a `/Lock`, a seed value (`/SV`) or a signature (`/V`). On these forms what signing locks is said in the XFA, by a manifest or by a script. SF 182 has no XFA, so nothing says it for its five.

### Manifests

An XFA signature field can hold a `<manifest>`. Adobe's reference for Designer says a manifest "contains a list of references to all the nodes that are included in a document signature", and of its `action` that `include`, the default, protects "all the fillable form nodes in the specified collection", `exclude` those "that are not in the specified collection", and `all` "all the fillable form nodes" ([manifest](https://help.adobe.com/en_US/AEMForms/6.1/DesignerScriptingRef/WS92d06802c76abadb-3e14850712a151d270d-7f9a.2.html), [action](https://help.adobe.com/en_US/AEMForms/6.1/DesignerScriptingRef/WS92d06802c76abadb-3e14850712a151d270d-7a10.2.html)). Designer's help for the option that writes one, Lock Fields After Signing, says what that protection is: "After the signing party signs the signature field, the fields in the specified area are locked", and with the option off "none of the fields in the form will be locked" ([Signature tab](https://help.adobe.com/en_US/AEMForms/6.1/DesignerHelp/WS92d06802c76abadb-728f46ac129b395660c-7ca9.2.html)). The XFA specification was not read for this record, and what Acrobat does with a manifest was not looked at.

| Form | Signature fields | Use a collection | Refs in each | Say `all` | No manifest |
| --- | --- | --- | --- | --- | --- |
| DD 1610 | 2 | 2 | 2, 2 | 0 | 0 |
| DD 577 | 4 | 4 | 5, 3, 2, 3 | 0 | 0 |
| DD 689 | 2 | 2 | 1, 1 | 0 | 0 |
| DD 2875 | 7 | 4 | 37, 2, 3, 7 | 0 | 3 |
| DAF 988 | 7 | 6 | 15, 3, 7, 3, 1, 3 | 1 | 0 |
| DAF 1288 | 6 | 5 | 52, 3, 3, 10, 28 | 1 | 0 |

- No manifest in a signature field holds a `<ref>` of its own. The 23 that use a collection point by `use` at the `id` of a `<manifest>` under the root subform's `<variables>`, which holds the refs. The two that say `all` point at none, and by Designer's help the three with no manifest lock nothing.
- In 17 of the 23 the collection holds the signature field itself, and for DD 689's two it holds nothing else. DAF 988's six are the ones that do not. DD 2875's collection of 37 holds a second signature field.
- Two of DAF 988's fields use one collection. Two of its refs name no node of its template, one in that shared collection and the only ref of another, so its six resolve to 15, 3, 7, 2, 0 and 2 nodes.
- Nine of DAF 1288's refs name an exclusion group, where every other ref that resolves names a field. It has five more collections that no signature field uses, and 18 signature fields that are prototypes under a `designer__stylesheet` subform and not on the form.
- None of the nine files holds an `<mdp>`, a `<lockDocument>` or a `<filter>` element.

### Scripts

Eleven of the 28 XFA signature fields carry a script. Nine, DD 1610's two and DD 2875's seven, run on `change`: each asks whether the field is signed and writes the day's date into a date field beside it. Six of the nine also set that date field read-only, and none of the six date fields is in its signature's collection. DD 689's two run on `preSign`.

## The Air Force's dynamic forms

Counted in the templates of the 946 dynamic forms of [`AF_EPUBS_FORMS.md`](AF_EPUBS_FORMS.md), prototypes left out:

| | The 946 | The 590 that record counts as converted |
| --- | --- | --- |
| Forms with a signature field the template shows | 338 | 236 |
| Those fields | 1,568 | 1,078 |
| Forms where one has a caption with text | 127 | 83 |
| Those captions | 405 | 267 |

A field counts as shown when neither it nor a subform around it is hidden, invisible or inactive in the template. What a script shows or hides once the form is open is not counted. Another 80 signature fields, in 15 forms, are in parts a template hides.

Of all 1,648, 753 have a manifest that says `include`, 155 one that says `exclude` and 209 one that says `all`. 531 have none.

The conversion carries none of these fields into a quill, and it leaves the caption out of the page (#43).

## A filled form

Read from the ten filled forms of [`ACCEPTANCE.md`](ACCEPTANCE.md), which the app exported with the engine at 0.124.0:

- None has `/Perms` or `/Encrypt`.
- `/AcroForm` has `/NeedAppearances true`, and `/SigFlags 1` on the four forms with a signature field.
- Each of the 13 AcroForm signature fields is there under the published field's full name, with its tooltip: one widget with `/FT /Sig` and `/F 4`, and no `/V`, `/Lock` or `/SV`.
- The 20 XFA signature fields of the three dynamic forms are not there (#43).
- No collection and no script is there from any of the six XFA forms: the XFA packet goes with the form layer. Nothing in a filled form says what a signature locks, and nothing writes a date beside one (#124).

## Not looked at

- Whether Acrobat shows a rights or security notice on a published form once qpdf has rewritten it, or on a filled form.
- What Acrobat locks when a published form is signed, and so what a signature on a filled form leaves open that one on the published form would close.
- Whether a signature placed in one of the 13 widgets validates, and whether it still does when the file is reopened. `/NeedAppearances` asks a viewer to rebuild field appearances as it opens the file.
- Whether a usage-rights signature verifies over its bytes, and whether its certificates chain to a root a viewer trusts today.
