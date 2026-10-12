// The end of assets/qpdf.worker.js. Above it in that file is qpdf-wasm's
// script, which defines Module. One message is one file: the page ends the
// worker once it has the answer, so nothing here is cleaned up.
onmessage = async ({ data: { bytes, flags, wasm, limit } }) => {
	let qpdf;
	try {
		qpdf = await Module({ locateFile: () => wasm });
	} catch {
		postMessage({ loaded: false });
		return;
	}
	let out;
	let written = 0;
	let said = '';
	try {
		qpdf.FS.writeFile('/in.pdf', bytes);
		// Nothing in qpdf bounds the file it writes: streams that lie inside one
		// another are each written whole. The write that passes the limit ends
		// the run.
		const { write } = qpdf.FS;
		const text = new TextDecoder();
		qpdf.FS.write = (stream, buffer, offset, length, ...rest) => {
			if ((written += length) > limit) throw new Error('qpdf wrote past the limit');
			// Its error stream. A qpdf that ends by itself says last why it writes no file, so the end is kept.
			if (stream.fd === 2)
				said = (said + text.decode(buffer.subarray(offset, offset + length))).slice(-1024);
			return write(stream, buffer, offset, length, ...rest);
		};
		// qpdf ends with 0, or with 3 when it warned. After an error the file is
		// as far as qpdf got with it.
		if ([0, 3].includes(qpdf.callMain(['/in.pdf', ...flags, '/out.pdf'])))
			out = qpdf.FS.readFile('/out.pdf');
	} catch {
		// qpdf wrote nothing it could stand behind. It did not end by itself, so
		// its last line is no error of its own: a warning carries the file's words.
		said = '';
	}
	const size = Math.max(written, qpdf.HEAPU8.byteLength);
	postMessage({ loaded: true, out, size, said }, out ? [out.buffer] : []);
};
