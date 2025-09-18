import { SemanticJoinPlanner } from '../../src/operators/join-planner';
import { type DataFrameLike, type SemanticContext } from '../../src/core/shadow-semantics';

function dfFrom(rows: Array<Record<string, any>>): DataFrameLike {
  const columns = Object.keys(rows[0] || {});
  return {
    columns,
    dtypes: Object.fromEntries(columns.map(c => [c, 'string'])),
    shape: [rows.length, columns.length],
    sample: (n = 1000) => {
      const out: Record<string, any[]> = {};
      for (const c of columns) out[c] = rows.slice(0, Math.min(n, rows.length)).map(r => r[c]);
      return out;
    },
    getColumn: (name: string) => rows.map(r => r[name])
  };
}

describe('Operators: SemanticJoinPlanner', () => {
  const planner = new SemanticJoinPlanner();
  const left = dfFrom([{ email: 'A' }, { email: 'B' }, { email: 'C' }]);
  const right = dfFrom([{ user_email: 'A' }, { user_email: 'D' }]);
  const ctx = (t: string, c = 0.9): SemanticContext => ({ anchor_id: '', semantic_type: t, confidence: c, metadata: {}, inferred_relations: [], domain_specific_tags: [] });

  it('plans an optimal join and returns a plan with expected fields', () => {
    const plan = planner.planOptimalJoin(
      left,
      right,
      { email: ctx('email_address') },
      { user_email: ctx('email_address') },
      { leftOn: 'email', rightOn: 'user_email', enableFuzzyMatching: true }
    );

    expect(plan.strategy).toBeDefined();
    expect(plan.normalizationPlan.leftColumns.length).toBe(1);
    expect(Array.isArray(plan.optimizations)).toBe(true);
    expect(plan.estimatedCost).toBeGreaterThan(0);
  });

  it('throws when join columns are missing', () => {
    expect(() => planner.planOptimalJoin(left, right, {}, {}, { leftOn: 'missing', rightOn: 'user_email' })).toThrow();
  });
});
