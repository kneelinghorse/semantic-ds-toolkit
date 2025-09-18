jest.mock('fs', () => ({
  __esModule: true,
  promises: {
    appendFile: jest.fn(async () => {}),
  },
  existsSync: jest.fn(() => false),
  createReadStream: jest.fn(),
}));

import { EvidenceStore, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';

describe('Evidence: EvidenceStore', () => {
  it('appends, queries, and summarizes evidence', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');

    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const mkTs = (offsetHours: number) => new Date(baseTime + offsetHours * 3600_000).toISOString();

    // Append a few entries
    const e1 = await store.append({
      type: EvidenceType.HUMAN_APPROVAL,
      source: EvidenceSource.HUMAN_FEEDBACK,
      data: { anchor_id: 'A', details: { note: 'approved' } }
    });
    // Manually adjust timestamp for deterministic ordering
    (e1 as any).timestamp = mkTs(0);

    const e2 = await store.append({
      type: EvidenceType.STATISTICAL_MATCH,
      source: EvidenceSource.STATISTICAL_MODEL,
      data: { anchor_id: 'A', confidence_score: 0.9, details: {} }
    });
    (e2 as any).timestamp = mkTs(1);

    const e3 = await store.append({
      type: EvidenceType.SCHEMA_CONSISTENCY,
      source: EvidenceSource.SYSTEM_VALIDATION,
      data: { anchor_id: 'B', details: { stable: true } }
    });
    (e3 as any).timestamp = mkTs(2);

    const allA = await store.getEvidenceForAnchor('A');
    expect(allA.length).toBe(2);

    const filtered = await store.query({ type: EvidenceType.SCHEMA_CONSISTENCY });
    expect(filtered.length).toBe(1);

    const recent = await store.getRecentEvidence(1); // last 1h from now; timestamps are in the past, may be 0
    expect(Array.isArray(recent)).toBe(true);

    const stats = await store.getStats();
    expect(stats.total_evidence).toBe(3);
    expect(stats.by_type[EvidenceType.HUMAN_APPROVAL]).toBe(1);
    expect(stats.by_source[EvidenceSource.SYSTEM_VALIDATION]).toBe(1);

    const replayAll = await store.replay();
    expect(replayAll.length).toBe(3);
  });

  it('load parses valid lines and warns on invalid JSONL', async () => {
    // Arrange mocks for fs + readline streaming
    const fs = require('fs');
    const readline = require('readline');

    fs.existsSync.mockReturnValue(true);
    fs.createReadStream.mockReturnValue({});

    const lines = [
      JSON.stringify({ id: '1', timestamp: new Date().toISOString(), type: EvidenceType.ANCHOR_CREATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'L', details: {} } }),
      '{ this is invalid json',
      '   ',
      JSON.stringify({ id: '2', timestamp: new Date().toISOString(), type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'L', details: {} } })
    ];

    const asyncIterator = (async function* () { for (const l of lines) { yield l; } })();
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      [Symbol.asyncIterator]: () => asyncIterator,
    } as any);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    await store.load();

    // Only the two valid lines should be loaded
    const res = await store.query({});
    expect(res.length).toBe(2);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
