import { CIDPack, CIDConcept, CIDFacets, CIDInferenceRule } from './cid-registry';
import { parse as parseYAML } from 'yaml';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

export interface PackSchema {
  pack: string;
  version: string;
  description?: string;
  depends_on?: string[];
  concepts: ConceptSchema[];
}

export interface ConceptSchema {
  cid: string;
  labels: string[];
  description?: string;
  facets: Record<string, any>;
  inference?: {
    rules: RuleSchema[];
  };
  examples?: string[];
  parent_cid?: string;
}

export interface RuleSchema {
  condition: string;
  action: string;
  confidence: number;
}

export class PackValidator {
  private static readonly RESERVED_FACET_KEYS = [
    'pii', 'temporal', 'numerical', 'categorical', 'identifier'
  ];

  private static readonly VERSION_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/;
  private static readonly CID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
  private static readonly PACK_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;

  validatePack(packData: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];

    this.validatePackStructure(packData, errors, warnings, info);

    if (errors.length === 0) {
      this.validatePackMetadata(packData, errors, warnings, info);
      this.validateConcepts(packData.concepts || [], errors, warnings, info);
      this.validateDependencies(packData.depends_on || [], errors, warnings, info);
      this.validateSemanticConsistency(packData, errors, warnings, info);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info
    };
  }

  validateYamlStructure(yamlContent: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];

    try {
      const parsed = parseYAML(yamlContent);
      return this.validatePack(parsed);
    } catch (error) {
      errors.push({
        path: 'root',
        message: `Invalid YAML structure: ${error}`,
        severity: 'error',
        code: 'YAML_PARSE_ERROR'
      });
    }

    return { valid: false, errors, warnings, info };
  }


  private validatePackStructure(
    packData: any,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const requiredFields = ['pack', 'version', 'concepts'];

    for (const field of requiredFields) {
      if (!(field in packData)) {
        errors.push({
          path: `root.${field}`,
          message: `Required field '${field}' is missing`,
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
    }

    if (typeof packData.pack !== 'string') {
      errors.push({
        path: 'root.pack',
        message: 'Pack name must be a string',
        severity: 'error',
        code: 'INVALID_TYPE'
      });
    }

    if (typeof packData.version !== 'string') {
      errors.push({
        path: 'root.version',
        message: 'Version must be a string',
        severity: 'error',
        code: 'INVALID_TYPE'
      });
    }

    if (!Array.isArray(packData.concepts)) {
      errors.push({
        path: 'root.concepts',
        message: 'Concepts must be an array',
        severity: 'error',
        code: 'INVALID_TYPE'
      });
    }
  }

  private validatePackMetadata(
    packData: any,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    if (packData.pack && !PackValidator.PACK_NAME_PATTERN.test(packData.pack)) {
      errors.push({
        path: 'root.pack',
        message: 'Pack name must follow naming convention (lowercase, dots allowed)',
        severity: 'error',
        code: 'INVALID_PACK_NAME'
      });
    }

    if (packData.version && !PackValidator.VERSION_PATTERN.test(packData.version)) {
      errors.push({
        path: 'root.version',
        message: 'Version must follow semantic versioning (x.y.z)',
        severity: 'error',
        code: 'INVALID_VERSION'
      });
    }

    if (packData.description && typeof packData.description !== 'string') {
      warnings.push({
        path: 'root.description',
        message: 'Description should be a string',
        severity: 'warning',
        code: 'INVALID_DESCRIPTION_TYPE'
      });
    }

    if (!packData.description) {
      info.push({
        path: 'root.description',
        message: 'Consider adding a description for better documentation',
        severity: 'info',
        code: 'MISSING_DESCRIPTION'
      });
    }
  }

  private validateConcepts(
    concepts: any[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const cidSet = new Set<string>();

    concepts.forEach((concept, index) => {
      const path = `concepts[${index}]`;
      this.validateConcept(concept, path, errors, warnings, info);

      if (concept.cid) {
        if (cidSet.has(concept.cid)) {
          errors.push({
            path: `${path}.cid`,
            message: `Duplicate CID '${concept.cid}'`,
            severity: 'error',
            code: 'DUPLICATE_CID'
          });
        } else {
          cidSet.add(concept.cid);
        }
      }
    });

    this.validateCidReferences(concepts, errors, warnings, info);
  }

  private validateConcept(
    concept: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const requiredFields = ['cid', 'labels', 'facets'];

    for (const field of requiredFields) {
      if (!(field in concept)) {
        errors.push({
          path: `${path}.${field}`,
          message: `Required field '${field}' is missing`,
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
    }

    if (concept.cid && !PackValidator.CID_PATTERN.test(concept.cid)) {
      errors.push({
        path: `${path}.cid`,
        message: 'CID must follow naming convention (lowercase, dots allowed)',
        severity: 'error',
        code: 'INVALID_CID_FORMAT'
      });
    }

    if (!Array.isArray(concept.labels)) {
      errors.push({
        path: `${path}.labels`,
        message: 'Labels must be an array of strings',
        severity: 'error',
        code: 'INVALID_LABELS_TYPE'
      });
    } else {
      concept.labels.forEach((label: any, labelIndex: number) => {
        if (typeof label !== 'string') {
          errors.push({
            path: `${path}.labels[${labelIndex}]`,
            message: 'Each label must be a string',
            severity: 'error',
            code: 'INVALID_LABEL_TYPE'
          });
        }
      });

      if (concept.labels.length === 0) {
        warnings.push({
          path: `${path}.labels`,
          message: 'Concept should have at least one label',
          severity: 'warning',
          code: 'EMPTY_LABELS'
        });
      }
    }

    this.validateFacets(concept.facets, `${path}.facets`, errors, warnings, info);

    if (concept.inference) {
      this.validateInference(concept.inference, `${path}.inference`, errors, warnings, info);
    }

    if (concept.parent_cid && !PackValidator.CID_PATTERN.test(concept.parent_cid)) {
      errors.push({
        path: `${path}.parent_cid`,
        message: 'Parent CID must follow naming convention',
        severity: 'error',
        code: 'INVALID_PARENT_CID_FORMAT'
      });
    }
  }

  private validateFacets(
    facets: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    if (typeof facets !== 'object' || facets === null) {
      errors.push({
        path,
        message: 'Facets must be an object',
        severity: 'error',
        code: 'INVALID_FACETS_TYPE'
      });
      return;
    }

    for (const [key, value] of Object.entries(facets)) {
      if (PackValidator.RESERVED_FACET_KEYS.includes(key)) {
        if (typeof value !== 'boolean') {
          errors.push({
            path: `${path}.${key}`,
            message: `Reserved facet '${key}' must be a boolean`,
            severity: 'error',
            code: 'INVALID_RESERVED_FACET_TYPE'
          });
        }
      }
    }

    if (Object.keys(facets).length === 0) {
      warnings.push({
        path,
        message: 'Consider adding facets to improve concept classification',
        severity: 'warning',
        code: 'EMPTY_FACETS'
      });
    }
  }

  private validateInference(
    inference: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    if (!inference.rules || !Array.isArray(inference.rules)) {
      errors.push({
        path: `${path}.rules`,
        message: 'Inference rules must be an array',
        severity: 'error',
        code: 'INVALID_INFERENCE_RULES_TYPE'
      });
      return;
    }

    inference.rules.forEach((rule: any, ruleIndex: number) => {
      const rulePath = `${path}.rules[${ruleIndex}]`;
      this.validateInferenceRule(rule, rulePath, errors, warnings, info);
    });
  }

  private validateInferenceRule(
    rule: any,
    path: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const requiredFields = ['condition', 'action', 'confidence'];

    for (const field of requiredFields) {
      if (!(field in rule)) {
        errors.push({
          path: `${path}.${field}`,
          message: `Required field '${field}' is missing in inference rule`,
          severity: 'error',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
    }

    if (typeof rule.condition !== 'string') {
      errors.push({
        path: `${path}.condition`,
        message: 'Rule condition must be a string',
        severity: 'error',
        code: 'INVALID_CONDITION_TYPE'
      });
    }

    if (typeof rule.action !== 'string') {
      errors.push({
        path: `${path}.action`,
        message: 'Rule action must be a string',
        severity: 'error',
        code: 'INVALID_ACTION_TYPE'
      });
    }

    if (typeof rule.confidence !== 'number' || rule.confidence < 0 || rule.confidence > 1) {
      errors.push({
        path: `${path}.confidence`,
        message: 'Rule confidence must be a number between 0 and 1',
        severity: 'error',
        code: 'INVALID_CONFIDENCE_VALUE'
      });
    }
  }

  private validateDependencies(
    dependencies: any[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    dependencies.forEach((dep, index) => {
      if (typeof dep !== 'string') {
        errors.push({
          path: `depends_on[${index}]`,
          message: 'Each dependency must be a string',
          severity: 'error',
          code: 'INVALID_DEPENDENCY_TYPE'
        });
        return;
      }

      const depPattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*(@|>=|<=|>|<|=).+$/;
      if (!depPattern.test(dep)) {
        errors.push({
          path: `depends_on[${index}]`,
          message: `Invalid dependency format: '${dep}'. Expected format: 'package@version' or 'package>=version'`,
          severity: 'error',
          code: 'INVALID_DEPENDENCY_FORMAT'
        });
      }
    });
  }

  private validateCidReferences(
    concepts: any[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const cidSet = new Set(concepts.map(c => c.cid).filter(Boolean));

    concepts.forEach((concept, index) => {
      if (concept.parent_cid && !cidSet.has(concept.parent_cid)) {
        warnings.push({
          path: `concepts[${index}].parent_cid`,
          message: `Parent CID '${concept.parent_cid}' not found in this pack`,
          severity: 'warning',
          code: 'UNKNOWN_PARENT_CID'
        });
      }
    });
  }

  private validateSemanticConsistency(
    packData: any,
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    const concepts = packData.concepts || [];
    const labelCounts = new Map<string, number>();

    concepts.forEach((concept: any) => {
      if (concept.labels) {
        concept.labels.forEach((label: string) => {
          const normalizedLabel = label.toLowerCase();
          labelCounts.set(normalizedLabel, (labelCounts.get(normalizedLabel) || 0) + 1);
        });
      }
    });

    for (const [label, count] of labelCounts) {
      if (count > 1) {
        warnings.push({
          path: 'concepts',
          message: `Label '${label}' appears in ${count} concepts, which may cause ambiguity`,
          severity: 'warning',
          code: 'DUPLICATE_LABEL'
        });
      }
    }
  }

  static createPackFromValidatedData(validatedData: any): CIDPack {
    return {
      pack: validatedData.pack,
      version: validatedData.version,
      description: validatedData.description,
      depends_on: validatedData.depends_on || [],
      concepts: validatedData.concepts.map((concept: any) => ({
        cid: concept.cid,
        labels: concept.labels,
        description: concept.description,
        facets: concept.facets,
        inference: concept.inference,
        examples: concept.examples,
        parent_cid: concept.parent_cid
      }))
    };
  }
}