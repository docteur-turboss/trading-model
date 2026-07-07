import { readFileSync, statSync } from 'fs';
import { globSync } from 'glob';

const SRC_GLOBS = [
  'packages/*/src/**/*.ts',
  'services/*/src/**/*.ts',
];

const EXCLUDE = [
  'node_modules',
  '**/*.d.ts',
  '**/*.spec.ts',
  '**/*.test.ts',
];

const THRESHOLD = 10; // long method threshold

const files = globSync(SRC_GLOBS, { ignore: EXCLUDE });

const methodPatterns = [
  // async method: async methodName(...) { ... }
  /(?:async\s+)?(?:private\s+|public\s+|protected\s+|static\s+)*(?:async\s+)?(?:get\s+|set\s+)?(?:constructor|[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm,
  // arrow function assigned to property: propName = (...) => {
  /[\w$]+\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^{]+)?\s*=>\s*\{/gm,
  // standalone function: function name(...) {
  /(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm,
  // method shorthand in object literals / classes: name(...) {
  /^\s*(?:async\s+)?(?:get\s+|set\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm,
];

function findMethodBodies(content, filePath) {
  const lines = content.split('\n');
  const methods = [];

  // Track brace depth
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments, empty lines, strings, etc.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    for (const pattern of methodPatterns) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (!match) continue;

      // Find the opening brace on this line
      let bracePos = line.indexOf('{');
      if (bracePos === -1) continue;

      // Walk to find matching closing brace
      let depth = 1;
      let j = i;
      let col = bracePos + 1;

      while (j < lines.length && depth > 0) {
        const l = lines[j];
        for (let c = col; c < l.length; c++) {
          if (l[c] === '{') depth++;
          else if (l[c] === '}') depth--;
          if (depth === 0) {
            const bodyStartLine = i;
            const bodyEndLine = j;
            const bodyLineCount = bodyEndLine - bodyStartLine + 1;

            if (bodyLineCount > THRESHOLD) {
              // Get the method signature
              const sigLine = lines[i].trim();
              methods.push({
                file: filePath,
                line: i + 1,
                signature: sigLine.substring(0, 120),
                bodyLines: bodyLineCount,
              });
            }
            break;
          }
        }
        j++;
        col = 0;
      }
      // Only match first pattern per line
      break;
    }
  }
  return methods;
}

const allMethods = [];

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    const methods = findMethodBodies(content, file);
    allMethods.push(...methods);
  } catch (e) {
    // skip binary or unreadable
  }
}

// Sort by body length descending
allMethods.sort((a, b) => b.bodyLines - a.bodyLines);

console.log(`\n=== LONG METHODS FOUND: ${allMethods.length} methods over ${THRESHOLD} lines ===\n`);

const buckets = {
  '11-20': [], '21-30': [], '31-50': [], '51-100': [], '100+': []
};

for (const m of allMethods) {
  if (m.bodyLines >= 100) buckets['100+'].push(m);
  else if (m.bodyLines >= 51) buckets['51-100'].push(m);
  else if (m.bodyLines >= 31) buckets['31-50'].push(m);
  else if (m.bodyLines >= 21) buckets['21-30'].push(m);
  else buckets['11-20'].push(m);
}

for (const [range, items] of Object.entries(buckets)) {
  if (items.length === 0) continue;
  console.log(`--- ${range} lines (${items.length} methods) ---`);
  for (const m of items.slice(0, 10)) {
    console.log(`  ${m.file}:${m.line} (${m.bodyLines} lines)`);
    console.log(`    ${m.signature}`);
  }
  if (items.length > 10) {
    console.log(`    ... and ${items.length - 10} more`);
  }
  console.log('');
}

// Group by file for the worst offenders
const fileCounts = {};
for (const m of allMethods) {
  if (!fileCounts[m.file]) fileCounts[m.file] = { count: 0, totalLines: 0, methods: [] };
  fileCounts[m.file].count++;
  fileCounts[m.file].totalLines += m.bodyLines;
  fileCounts[m.file].methods.push(m);
}

const worstFiles = Object.entries(fileCounts)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 20);

console.log('=== WORST FILES (most long methods) ===\n');
for (const [file, info] of worstFiles) {
  console.log(`  ${file}: ${info.count} long methods, ${info.totalLines} total body lines`);
}

console.log('\n=== SUMMARY ===');
console.log(`Total files scanned: ${files.length}`);
console.log(`Total long methods (>${THRESHOLD} lines): ${allMethods.length}`);
console.log(`  11-20 lines: ${buckets['11-20'].length}`);
console.log(`  21-30 lines: ${buckets['21-30'].length}`);
console.log(`  31-50 lines: ${buckets['31-50'].length}`);
console.log(`  51-100 lines: ${buckets['51-100'].length}`);
console.log(`  100+ lines: ${buckets['100+'].length}`);
