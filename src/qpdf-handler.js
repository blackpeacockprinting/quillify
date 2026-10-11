// The end of assets/qpdf.worker.js. Above it in that file is qpdf-wasm's
// script, which defines Module. One message is one file: the page ends the
// worker once it has the answer, so nothing here is cleaned up.
onmessage = async ({ data: { bytes, flags, wasm } }) => {
	let qpdf;
	try {
		qpdf = await Module({ locateFile: () => wasm });
	} catch {
		postMessage({ loaded: false });
		return;
	}
	let out;
	try {
		qpdf.FS.writeFile('/in.pdf', bytes);
		// qpdf ends with 0, or with 3 when it warned. After an error the file is
		// as far as qpdf got with it.
		if ([0, 3].includes(qpdf.callMain(['/in.pdf', ...flags, '/out.pdf'])))
			out = qpdf.FS.readFile('/out.pdf');
	} catch {
		// qpdf wrote nothing it could stand behind.
	}
	postMessage({ loaded: true, out }, out ? [out.buffer] : []);
};
