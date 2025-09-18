#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const root = process.cwd();
const entry = path.join(root, 'src', 'index.ts');
const outPath = path.join(root, 'docs', 'reference', 'api-reference.md');

function parseExports(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result = new Map(); // moduleSpecifier -> { names: [], types: [] }

  sf.forEachChild(node => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      const mod = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : '(local)';
      if (!result.has(mod)) result.set(mod, { names: [], types: [] });
      const bucket = result.get(mod);
      for (const el of node.exportClause.elements) {
        const name = (el.name?.escapedText || el.getText()).toString();
        if (el.isTypeOnly || node.isTypeOnly) {
          bucket.types.push(name);
        } else {
          bucket.names.push(name);
        }
      }
    }
  });
  return result;
}

function renderMarkdown(exportsMap) {
  const lines = [];
  lines.push('<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->');
  lines.push('# API Reference (Auto-Generated)');
  lines.push('');
  lines.push('Generated from `src/index.ts`. Run `npm run docs:api` to regenerate.');
  lines.push('');
  lines.push('## Modules and Exports');
  lines.push('');
  for (const [mod, buckets] of exportsMap.entries()) {
    lines.push(`### Module: ${mod}`);
    if (buckets.names.length) {
      lines.push('');
      lines.push('Exports:');
      for (const n of buckets.names.sort()) {
        lines.push('- `' + n + '`');
      }
    }
    if (buckets.types.length) {
      lines.push('');
      lines.push('Type Exports:');
      for (const t of buckets.types.sort()) {
        lines.push('- `type ' + t + '`');
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function mergeIntoTemplate(generatedContent, templatePath) {
  const template = fs.readFileSync(templatePath, 'utf-8');
  const start = '<!-- AUTO-GENERATED:START -->';
  const end = '<!-- AUTO-GENERATED:END -->';
  if (!template.includes(start) || !template.includes(end)) {
    return generatedContent; // fallback: overwrite file
  }
  const prefix = template.split(start)[0];
  const suffix = template.split(end)[1] ?? '';
  return `${prefix}${start}\n${generatedContent}\n${end}${suffix}`;
}

try {
  const exportsMap = parseExports(entry);
  const generated = renderMarkdown(exportsMap);
  const merged = mergeIntoTemplate(generated, outPath);
  fs.writeFileSync(outPath, merged, 'utf-8');
  console.log(`✅ API reference generated at ${outPath}`);
} catch (err) {
  console.error('❌ Failed to generate API reference:', err?.message || err);
  process.exit(1);
}
