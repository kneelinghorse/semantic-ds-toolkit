import { describe, beforeEach, it, expect } from '@jest/globals';
import { SemanticJoinOperator } from '../src/operators/semantic-join';
import { CIDRegistry } from '../src/registry/cid-registry';

describe('SemanticJoinOperator Integration', () => {
  let joinOperator: SemanticJoinOperator;
  let cidRegistry: CIDRegistry;

  beforeEach(() => {
    cidRegistry = new CIDRegistry();
    joinOperator = new SemanticJoinOperator(cidRegistry);

    cidRegistry.registerPack({
      pack: 'integration-test-pack',
      version: '1.0.0',
      concepts: [
        {
          cid: 'person.email',
          labels: ['email', 'email_address', 'user_email'],
          description: 'Email address field',
          facets: { pii: true }
        },
        {
          cid: 'identifier.user_id',
          labels: ['user_id', 'id'],
          description: 'Generic user identifier',
          facets: { identifier: true }
        }
      ]
    });
  });

  it('emits confidence metadata and uses CID-selected normalizers', async () => {
    const leftData = {
      email_address: ['ALICE@EXAMPLE.COM', 'bob@example.com', 'charlie@example.org'],
      id: ['L-1', 'L-2', 'L-3']
    };

    const rightData = {
      user_email: ['alice@example.com', 'carol@example.org', 'bob@example.com'],
      user_id: ['R-1', 'R-2', 'R-3']
    };

    const result = await joinOperator.semanticJoin(leftData, rightData, {
      leftOn: 'email_address',
      rightOn: 'user_email',
      how: 'inner',
      autoSelectNormalizers: true,
      confidenceThreshold: 0.1
    });

    expect(result.matches.length).toBeGreaterThan(0);
    const [firstMatch] = result.matches;

    // CID-driven normalizer selection should surface the email normalizer in metadata
    expect(firstMatch.normalizerUsed).toContain('email');

    // Confidence calculator metadata should be attached and influence the score
    const confidenceMeta = (firstMatch.metadata?.confidenceScore as { overall: number }) || null;
    expect(confidenceMeta).not.toBeNull();
    expect(confidenceMeta!.overall).toBeGreaterThan(0.1);
    expect(firstMatch.confidence).toBeCloseTo(confidenceMeta!.overall, 3);

    // Match evidence should describe normalization impact
    const matchEvidence = firstMatch.metadata?.matchEvidence as Array<{ matchType: string }> | undefined;
    expect(matchEvidence).toBeDefined();
    expect(matchEvidence!.length).toBeGreaterThan(0);
  });
});
