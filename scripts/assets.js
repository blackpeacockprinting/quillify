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
		line: 'if (!this.ui) {',
		guarded: 'if (!this.ui || this.ui.defaultUi || !this.ui[$getExtra]()) {'
	},
	{
		sites: 1,
		line: 'const ui = this.ui[$toHTML]().html;',
		guarded:
			'const ui = this.ui[$toHTML]().html ?? { name: "label", attributes: { class: ["xfaLabel"] }, children: [{ name: "div", attributes: { class: [this.ui.signature ? "xfaSignature" : this.ui.barcode ? "xfaBarcode" : this.ui.passwordEdit ? "xfaPasswordEdit" : "xfaImageEdit"], style: { width: "100%" } }, children: [] }] };'
	},
	{
		sites: 1,
		line: 'this[$extra].pageSetIndex = -1;',
		guarded: 'this[$extra].pageSetIndex = -1; this[$cleanPage]();'
	},
	{
		sites: 1,
		line: 'warn(`XFA - an error occurred during layout: ${e}`);',
		guarded:
			'warn(`XFA - an error occurred during layout: ${e}`); throw new Error(`XFA layout: ${e.message}`);'
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

const qpdfWasm = JSON.parse(
	readFileSync('node_modules/@neslinesli93/qpdf-wasm/package.json', 'utf8')
);
const qpdf = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'utf8');
const handler = readFileSync('src/qpdf-handler.js', 'utf8');

const stylesheet = readFileSync('src/xfa-layer.css', 'utf8');

rmSync('assets', { recursive: true, force: true });
mkdirSync('assets');
for (const [name, content] of [
	[
		'pdf.worker.js',
		`/* The worker of pdfjs-dist ${version} (build/pdf.worker.mjs), changed: a null guard added at two sites, a page's first unsplittable node no longer taken from an overflow leader or trailer, a page set made to clear its page areas' counts when it starts another pass, a field with no control or a default one given a text control, a field whose control has no HTML given a box for it so that its caption is laid out, an exception of the XFA layout thrown on after it is logged, and the last line, which named a source map, removed. */\n` +
			worker
	],
	[
		'qpdf.worker.js',
		`/* dist/qpdf.js of @neslinesli93/qpdf-wasm ${qpdfWasm.version}, unchanged, and after it quillify's message handler. */\n` +
			qpdf +
			handler
	],
	['qpdf.wasm', wasm],
	['xfa-layer.js', `export default ${JSON.stringify(stylesheet)};\n`],
	['xfa-layer.d.ts', 'declare const stylesheet: string;\nexport default stylesheet;\n']
]) {
	writeFileSync(`assets/${name}`, content);
	console.log(`assets/${name}: ${Buffer.byteLength(content)} bytes`);
}
