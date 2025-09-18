import { getJoinAdapter, PolarsJoinAdapter } from '../../src/operators/dataframe-join-adapters';

describe('Operators: Polars LazyFrame collect path', () => {
  it('handles LazyFrame by collecting before conversion', () => {
    const df = {
      columns: ['x'],
      data: { x: [1, 2, 3] },
      getColumns: () => ['x'],
      dtypes: () => ['Int64'],
      getColumn: (name: string) => ({ toArray: () => [1,2,3], toList: () => [1,2,3] }),
    };

    const lazy = {
      constructor: { name: 'LazyFrame' },
      collect: () => df,
      getColumns: () => ['x'],
    } as any;

    const adapter = getJoinAdapter(lazy);
    expect(adapter).toBeInstanceOf(PolarsJoinAdapter);

    const dfLike = (adapter as PolarsJoinAdapter).toDataFrameLike(lazy);
    expect(dfLike.columns).toEqual(['x']);
    const res = adapter!.fromJoinResult({ data: [{ x: 1 }, { x: 2 }] } as any, lazy, lazy, {} as any);
    expect(res.width).toBeGreaterThan(0);
  });
});
