/**
 * Guards the two lines of the installed pdf.js worker that stop DAF 1288 from
 * loading. prose/research/pdfjs-som-null-guard.diff has the diagnosis.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const WORKER = 'node_modules/pdfjs-dist/build/pdf.worker.mjs';
const UNGUARDED = 'children = children.isXFAObjectArray ? children.children : [children];';
const GUARDED =
	'children = children == null ? [] : children.isXFAObjectArray ? children.children : [children];';

const worker = readFileSync(WORKER, 'utf8');
const unguarded = worker.split(UNGUARDED).length - 1;
const guarded = worker.split(GUARDED).length - 1;

if (unguarded === 2 && guarded === 0) {
	writeFileSync(WORKER, worker.replaceAll(UNGUARDED, GUARDED));
	console.log(`${WORKER}: guarded 2 sites`);
} else if (unguarded === 0 && guarded === 2) {
	console.log(`${WORKER}: both sites are already guarded`);
} else {
	throw new Error(
		`${WORKER}: expected 2 unguarded sites or 2 guarded, found ${unguarded} and ${guarded}`
	);
}
