import { CIDRegistry, CIDPack } from '../src/registry/cid-registry';
import { PackManager } from '../src/registry/pack-manager';
import { PackValidator } from '../src/registry/pack-validator';
import * as fs from 'fs';
import * as path from 'path';

describe('CID Registry System', () => {
  let registry: CIDRegistry;
  let packManager: PackManager;
  let validator: PackValidator;

  beforeEach(() => {
    registry = new CIDRegistry();
    packManager = new PackManager(registry);
    validator = new PackValidator();
  });

  describe('PackValidator', () => {
    it('should validate YAML pack structure', () => {
      const validPack = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'test.concept',
            labels: ['test_label'],
            facets: { pii: true },
            inference: {
              rules: [
                {
                  condition: 'true',
                  action: 'test_action',
                  confidence: 0.8
                }
              ]
            }
          }
        ]
      };

      const result = validator.validatePack(validPack);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid pack structure', () => {
      const invalidPack = {
        pack: 'INVALID-NAME',
        version: '1.0',
        concepts: 'not an array'
      };

      const result = validator.validatePack(invalidPack);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate CID naming convention', () => {
      const packWithInvalidCID = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'INVALID-CID',
            labels: ['test'],
            facets: {}
          }
        ]
      };

      const result = validator.validatePack(packWithInvalidCID);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CID_FORMAT')).toBe(true);
    });

    it('should detect duplicate CIDs', () => {
      const packWithDuplicateCIDs = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          { cid: 'test.concept', labels: ['test1'], facets: {} },
          { cid: 'test.concept', labels: ['test2'], facets: {} }
        ]
      };

      const result = validator.validatePack(packWithDuplicateCIDs);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_CID')).toBe(true);
    });
  });

  describe('CIDRegistry', () => {
    it('should register and lookup concepts', () => {
      const testPack: CIDPack = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'test.person',
            labels: ['user_id', 'customer_id'],
            facets: { pii: true, identifier: true },
            description: 'Person identifier'
          }
        ]
      };

      registry.registerPack(testPack);

      const concept = registry.getConcept('test.person');
      expect(concept).toBeTruthy();
      expect(concept!.labels).toContain('user_id');

      const lookupResults = registry.lookupByLabel('user_id');
      expect(lookupResults).toHaveLength(1);
      expect(lookupResults[0].concept.cid).toBe('test.person');
      expect(lookupResults[0].confidence).toBe(1.0);
    });

    it('should perform fuzzy label matching', () => {
      const testPack: CIDPack = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'test.person',
            labels: ['user_identifier', 'customer_id'],
            facets: { pii: true }
          }
        ]
      };

      registry.registerPack(testPack);

      // Test fuzzy matching for 'user_id' against 'user_identifier'
      const lookupResults = registry.lookupByLabel('user_id');
      expect(lookupResults.length).toBeGreaterThan(0);
      if (lookupResults.length > 0) {
        expect(lookupResults[0].match_type).toBe('label');
        expect(lookupResults[0].confidence).toBeLessThan(1.0);
      }
    });

    it('should lookup by criteria', () => {
      const testPack: CIDPack = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'test.email',
            labels: ['email'],
            facets: { pii: true, identifier: true }
          }
        ]
      };

      registry.registerPack(testPack);

      const results = registry.lookupByCriteria({
        facets: { pii: true, identifier: true }
      });

      expect(results).toHaveLength(1);
      expect(results[0].concept.cid).toBe('test.email');
    });

    it('should evaluate inference rules', () => {
      const testPack: CIDPack = {
        pack: 'test.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'test.email',
            labels: ['email'],
            facets: { pii: true },
            inference: {
              rules: [
                {
                  condition: 'patterns && patterns.some(p => /@/.test(p))',
                  action: 'suggest_email',
                  confidence: 0.9
                }
              ]
            }
          }
        ]
      };

      registry.registerPack(testPack);

      const results = registry.lookupByCriteria({
        patterns: ['test@example.com']
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].match_type).toBe('inference');
    });
  });

  describe('PackManager', () => {
    it('should resolve simple dependencies', async () => {
      const basePack: CIDPack = {
        pack: 'base.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'base.concept',
            labels: ['base'],
            facets: {}
          }
        ]
      };

      const dependentPack: CIDPack = {
        pack: 'dependent.pack',
        version: '1.0.0',
        depends_on: ['base.pack>=1.0.0'],
        concepts: [
          {
            cid: 'dependent.concept',
            labels: ['dependent'],
            facets: {}
          }
        ]
      };

      // Load base pack first
      await packManager.loadPack(basePack);

      // Load dependent pack
      const result = await packManager.loadPack(dependentPack);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(registry.getLoadedPacks()).toContain('base.pack');
      expect(registry.getLoadedPacks()).toContain('dependent.pack');
    });

    it('should detect circular dependencies', async () => {
      const packA: CIDPack = {
        pack: 'pack.a',
        version: '1.0.0',
        depends_on: ['pack.b>=1.0.0'],
        concepts: [
          {
            cid: 'a.concept',
            labels: ['a'],
            facets: {}
          }
        ]
      };

      const packB: CIDPack = {
        pack: 'pack.b',
        version: '1.0.0',
        depends_on: ['pack.a>=1.0.0'],
        concepts: [
          {
            cid: 'b.concept',
            labels: ['b'],
            facets: {}
          }
        ]
      };

      const result = await packManager.loadMultiplePacks([packA, packB]);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Circular dependency'))).toBe(true);
    });

    it('should validate version constraints', async () => {
      const basePack: CIDPack = {
        pack: 'base.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'base.concept',
            labels: ['base'],
            facets: {}
          }
        ]
      };

      const dependentPack: CIDPack = {
        pack: 'dependent.pack',
        version: '1.0.0',
        depends_on: ['base.pack>=2.0.0'], // Requires higher version
        concepts: [
          {
            cid: 'dependent.concept',
            labels: ['dependent'],
            facets: {}
          }
        ]
      };

      await packManager.loadPack(basePack);
      const result = await packManager.loadPack(dependentPack);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should load multiple packs with complex dependencies', async () => {
      const packs: CIDPack[] = [
        {
          pack: 'common.units',
          version: '0.1.0',
          concepts: [
            {
              cid: 'units.currency',
              labels: ['price', 'cost'],
              facets: { numerical: true }
            }
          ]
        },
        {
          pack: 'common.identity',
          version: '0.1.0',
          depends_on: ['common.units>=0.1.0'],
          concepts: [
            {
              cid: 'identity.person',
              labels: ['user_id'],
              facets: { pii: true, identifier: true }
            }
          ]
        },
        {
          pack: 'common.time',
          version: '0.1.0',
          concepts: [
            {
              cid: 'time.timestamp',
              labels: ['created_at'],
              facets: { temporal: true }
            }
          ]
        }
      ];

      const result = await packManager.loadMultiplePacks(packs);

      expect(result.success).toBe(true);
      expect(result.loadOrder).toContain('common.units');
      expect(result.loadOrder).toContain('common.identity');
      expect(result.loadOrder).toContain('common.time');
      expect(result.loadOrder.indexOf('common.units')).toBeLessThan(result.loadOrder.indexOf('common.identity'));
      expect(registry.getLoadedPacks().length).toBe(3);
    });

    it('should manage pack metadata and dependencies', async () => {
      const basePack: CIDPack = {
        pack: 'base.pack',
        version: '1.0.0',
        concepts: [
          {
            cid: 'base.concept',
            labels: ['base'],
            facets: {}
          }
        ]
      };

      const dependentPack: CIDPack = {
        pack: 'dependent.pack',
        version: '1.0.0',
        depends_on: ['base.pack>=1.0.0'],
        concepts: [
          {
            cid: 'dependent.concept',
            labels: ['dependent'],
            facets: {}
          }
        ]
      };

      await packManager.loadPack(basePack);
      await packManager.loadPack(dependentPack);

      const loadedPacks = packManager.getLoadedPacks();
      expect(loadedPacks).toHaveLength(2);

      const baseDependents = packManager.getDependents('base.pack');
      expect(baseDependents).toContain('dependent.pack');

      const dependentDeps = packManager.getDependencies('dependent.pack');
      expect(dependentDeps).toContain('base.pack');
    });

    it('should validate pack compatibility', () => {
      const incompatiblePacks: CIDPack[] = [
        {
          pack: 'test.pack',
          version: '1.0.0',
          concepts: []
        },
        {
          pack: 'test.pack', // Same pack name, different version
          version: '2.0.0',
          concepts: []
        }
      ];

      const result = packManager.validatePackCompatibility(incompatiblePacks);
      expect(result.compatible).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Real Pack Loading', () => {
    it('should load and validate actual pack files', async () => {
      const packsDir = path.join(__dirname, '../semantics/packs');

      if (fs.existsSync(packsDir)) {
        const packFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.yml'));
        const packs: CIDPack[] = [];

        // First, validate and parse all packs
        for (const packFile of packFiles) {
          const packPath = path.join(packsDir, packFile);
          const yamlContent = fs.readFileSync(packPath, 'utf8');

          const validationResult = validator.validateYamlStructure(yamlContent);

          if (validationResult.valid) {
            const packData = (await import('yaml')).parse(yamlContent);
            const pack = PackValidator.createPackFromValidatedData(packData);
            packs.push(pack);
          }
        }

        // Then load all packs together to handle dependencies
        if (packs.length > 0) {
          const loadResult = await packManager.loadMultiplePacks(packs);
          expect(loadResult.success).toBe(true);
        }

        if (packFiles.length > 0) {
          // Test lookup performance
          const start = Date.now();
          const results = registry.lookupByLabel('user_id');
          const duration = Date.now() - start;

          expect(duration).toBeLessThan(10); // Should be less than 10ms

          // Test that at least some packs were loaded
          expect(registry.getLoadedPacks().length).toBeGreaterThan(0);

          // Test concept retrieval
          const allConcepts = registry.getAllConcepts();
          expect(allConcepts.length).toBeGreaterThan(0);
        } else {
          // If no pack files found, skip the test gracefully
          expect(true).toBe(true);
        }
      } else {
        // If directory doesn't exist, skip the test gracefully
        expect(true).toBe(true);
      }
    });
  });
});