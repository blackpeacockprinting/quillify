import { expect, it } from 'vitest';

it('runs in node', () => {
	expect(typeof document).toBe('undefined');
});
