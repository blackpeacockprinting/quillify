# quillify

Converts a published PDF form into a Quillmark quill for the `acroform` backend.

Of 59 published government forms measured, 38 are locked behind a permissions wrapper with an empty password, and 17 hold their fields only as an Adobe LiveCycle (XFA) template behind a "Please wait" page. Quillmark's `acroform` backend takes neither. It takes a background PDF with no form layer and a `form.json` that says where each field goes. This package makes those two files and the `Quill.yaml` beside them.

It is logic and tests, with no interface, and it runs in a browser.

## Status

`sanitize` reads a PDF into its fields and a background with no form layer, or returns the reason it does not take the file. `suggest` names the fields from the form's own tooltips, `check` says what is wrong with a naming, and `quillify` builds the quill's files from the form and a naming. The code comes from `tonguetoquill/web-app-afa-demo@842ef4207cb5`, in the order [#1](https://github.com/tonguetoquill/quillify/issues/1) lays out. [`prose/DECISIONS.md`](prose/DECISIONS.md) has what was decided and what would unlock a different answer.

## What it leaves to the consumer

- The interface, including the screen where a person reviews and corrects field names.
- Any model. Names come from the form's own tooltips, or from whatever the consumer supplies.
- Storage, and what happens to a quill once it is built.
