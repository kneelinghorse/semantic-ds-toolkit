import { getJoinAdapter, getSupportedJoinTypes, PandasJoinAdapter, PolarsJoinAdapter } from '../../src/operators/dataframe-join-adapters';

describe('Operators: DataFrame Join Adapters', () => {
  it('registry supports pandas and polars', () => {
    const types = getSupportedJoinTypes();
    expect(types).toEqual(expect.arrayContaining(['pandas', 'polars']));
  });

  it('pandas adapter canHandle and basic to/from behavior', () => {
    const pandasLike: any = {
      constructor: { name: 'DataFrame' },
      columns: ['a', 'b'],
      dtypes: { a: 'int64', b: 'object' },
      length: 1,
      a: [1],
      b: ['x']
    };
    const adapter = getJoinAdapter(pandasLike);
    expect(adapter).toBeInstanceOf(PandasJoinAdapter);

    const dfLike = (adapter as PandasJoinAdapter).toDataFrameLike(pandasLike);
    expect(dfLike.columns).toEqual(['a', 'b']);
    expect(dfLike.shape[1]).toBe(2);

    const optimized = adapter!.optimizeForType({} as any);
    expect(optimized.batchSize).toBeDefined();

    const emptyJoined = adapter!.fromJoinResult({ data: [] } as any, pandasLike, pandasLike, {} as any);
    expect(emptyJoined.empty).toBe(true);
    expect(emptyJoined.shape[0]).toBe(0);
  });

  it('polars adapter canHandle and basic fromJoinResult', () => {
    // Shape it so it matches Polars adapter but not Pandas (no dtypes/columns fields)
    const polarsLike: any = {
      constructor: { name: 'DataFrame' },
      width: 1,
      height: 1,
      getColumns: () => ['x'],
      dtypes: () => ['Int64'],
      getColumn: (name: string) => ({ toArray: () => [1], toList: () => [1] })
    };

    const adapter = getJoinAdapter(polarsLike);
    expect(adapter).toBeInstanceOf(PolarsJoinAdapter);

    const result = adapter!.fromJoinResult({ data: [{ x: 1 }] } as any, polarsLike, polarsLike, {} as any);
    expect(result.width).toBeGreaterThan(0);
    expect(typeof result.dtypes).toBe('function');
  });
});
