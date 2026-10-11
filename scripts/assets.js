// prose/research/pdfjs-som-null-guard.diff has the diagnosis behind the null guard.

import { hash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const GUARDS = [
	{
		sites: 2,
		line: 'children = children.isXFAObjectArray ? children.children : [children];',
		guarded:
			'children = children == null ? [] : children.isXFAObjectArray ? children.children : [children];'
	},
	{
		sites: 1,
		line: 'const savedMethod = extraNode[$getSubformParent];',
		guarded:
			'const savedMethod = extraNode[$getSubformParent]; const savedFirst = root[$extra].firstUnsplittable;'
	},
	{
		sites: 1,
		line: 'extraNode[$getSubformParent] = savedMethod;',
		guarded:
			'extraNode[$getSubformParent] = savedMethod; root[$extra].firstUnsplittable = savedFirst;'
	},
	{
		sites: 1,
		line: 'this[$extra].pageSetIndex = -1;',
		guarded: 'this[$extra].pageSetIndex = -1; this[$cleanPage]();'
	}
];
const SOURCE_MAP = '//# sourceMappingURL=pdf.worker.mjs.map';
const QPDF_WASM = 'abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876';

const { version } = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'));
let worker = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
if (!worker.endsWith(SOURCE_MAP)) throw new Error(`pdf.worker.mjs does not end in ${SOURCE_MAP}`);
worker = worker.slice(0, -SOURCE_MAP.length);
for (const { sites, line, guarded } of GUARDS) {
	const found = worker.split(line).length - 1;
	if (found !== sites)
		throw new Error(
			`pdf.worker.mjs has \`${line}\` at ${found} sites, and its guard is written for ${sites}. ` +
				'If node_modules was patched in place by an older checkout, reinstall it with `npm ci`.'
		);
	worker = worker.replaceAll(line, guarded);
}

const wasm = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const sha256 = hash('sha256', wasm);
if (sha256 !== QPDF_WASM) throw new Error(`qpdf.wasm hashes to ${sha256}, expected ${QPDF_WASM}`);

const stylesheet = readFileSync('src/xfa-layer.css', 'utf8');

rmSync('assets', { recursive: true, force: true });
mkdirSync('assets');
for (const [name, content] of [
	[
		'pdf.worker.js',
		`/* The worker of pdfjs-dist ${version} (build/pdf.worker.mjs), changed: a null guard added at two sites, a page's first unsplittable node no longer taken from an overflow leader or trailer, a page set made to clear its page areas' counts when it starts another pass, and the last line, which named a source map, removed. */\n` +
			worker
	],
	['qpdf.wasm', wasm],
	['xfa-layer.js', `export default ${JSON.stringify(stylesheet)};\n`],
	['xfa-layer.d.ts', 'declare const stylesheet: string;\nexport default stylesheet;\n']
]) {
	writeFileSync(`assets/${name}`, content);
	console.log(`assets/${name}: ${Buffer.byteLength(content)} bytes`);
}
