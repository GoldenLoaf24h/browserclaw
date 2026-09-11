import { describe, it, expect } from 'vitest';
import { captureDeltaIfRequested } from '../utils/delta-helper';

describe('captureDeltaIfRequested Helper', () => {
  it('returns undefined when includeDelta is false or omitted', async () => {
    const res1 = await captureDeltaIfRequested(1, false);
    const res2 = await captureDeltaIfRequested(1, undefined);
    expect(res1).toBeUndefined();
    expect(res2).toBeUndefined();
  });
});
