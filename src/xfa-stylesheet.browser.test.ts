import { expect, it, vi } from 'vitest';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import { normalizePdf } from './normalize.js';
import { xfaToAcroForm } from './xfa.js';

vi.mock('../assets/xfa-layer.js', () => ({ default: '' }));

it('ends a conversion with an error when the stage stylesheet does not apply', async () => {
	const saar = new Uint8Array(await (await fetch(saarUrl)).arrayBuffer());
	await expect(xfaToAcroForm(await normalizePdf(saar))).rejects.toThrow(
		'The XFA stylesheet did not apply'
	);
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);
