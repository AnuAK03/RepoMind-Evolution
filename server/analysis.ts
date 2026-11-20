import fs from 'fs';
import path from 'path';
import type {
  ArchEvolutionResult,
  ChangeImpactResult,
  ContributorKnowledgeResult,
  ContributorStat,
  DebtItem,
  FileRiskScore,
  ImpactedComponent,
  KnowledgeConcentration,
  ProjectHealthResult,
  RepoComparisonResult,
  RepoWorkspace,
  ResearchEvaluationResult,
  RiskFactor,
  RiskSummaryResult,
  TechnicalDebtResult,
  TestCaseInfo,
  TestFileInfo,
  TestImpactResult,
  TestRecommendation,
} from './types.ts';
import { scanRepository, WORKSPACE_ROOT } from './scanner.ts';
import { extractRefSnapshot, getRawGitCliVerificationStats } from './gitintel.ts';

function buildReverseAdj(workspace: RepoWorkspace): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const edge of workspace.graph.edges) {
    if (!rev.has(edge.target)) rev.set(edge.target, new Set());
    rev.get(edge.target)!.add(edge.source);
  }
  return rev;
}

function discoverTestFiles(workspace: RepoWorkspace): {
  frameworks: string[];
  testFiles: TestFileInfo[];
  totalCases: number;
} {
  const frameworks = new Set<string>(workspace.meta.frameworks.filter((f) => ['Pytest', 'Vitest', 'Jest'].includes(f)));
  const testFiles: TestFileInfo[] = [];

  for (const file of Object.values(workspace.files)) {
    if (!file.isTest) continue;
    const cases: TestCaseInfo[] = [];
    const lines = file.content.split('\n');

    if (file.language === 'Python') {
      if (file.content.includes('pytest')) frameworks.add('Pytest');
      if (file.content.includes('unittest')) frameworks.add('unittest');
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*(?:async\s+)?def\s+(test_[A-Za-z0-9_]+)/);
        if (m) cases.push({ name: m[1], line: i + 1 });
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/\b(?:it|test)\s*\(\s*['"`]([^'"`]+)/);
        if (m) cases.push({ name: m[1], line: i + 1 });
      }
      if (file.content.includes('vitest')) frameworks.add('Vitest');
      if (file.content.includes('jest')) frameworks.add('Jest');
    }

    testFiles.push({
      path: file.path,
      language: file.language,
      caseCount: cases.length,
      cases,
      directTargets: file.imports.filter((imp) => !workspace.files[imp]?.isTest),
    });
  }

  testFiles.sort((a, b) => a.path.localeCompare(b.path));
  return {
    frameworks: [...frameworks].sort(),
    testFiles,
    totalCases: testFiles.reduce((s, t) => s + t.caseCount, 0),
  };
}

// ============================================================================
// MODULE 3: CHANGE IMPACT ANALYSIS ENGINE
// ============================================================================
export function computeChangeImpact(
  workspace: RepoWorkspace,
  targetFile: string,
  targetSymbol: string | null = null,
  commitSha: string | null = null
): ChangeImpactResult {
  const t0 = performance.now();
  const fileRec = workspace.files[targetFile];
  if (!fileRec) {
    throw new Error(`File "${targetFile}" not found in repository.`);
  }

  const revAdj = buildReverseAdj(workspace);
  const visited = new Set<string>([targetFile]);
  const queue: { path: string; depth: number; pathChain: string[] }[] = [
    { path: targetFile, depth: 0, pathChain: [targetFile] },
  ];

  const directDependents: ImpactedComponent[] = [];
  const transitiveDependents: ImpactedComponent[] = [];
  const affectedApis: { file: string; method: string; route: string; line: number; hop: number }[] = [];

  for (const ep of fileRec.endpoints) {
    affectedApis.push({ file: targetFile, method: ep.method, route: ep.route, line: ep.line, hop: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const importers = [...(revAdj.get(current.path) || [])].sort();
    for (const depPath of importers) {
      if (visited.has(depPath)) continue;
      visited.add(depPath);
      const nextDepth = current.depth + 1;
      const nextChain = [...current.pathChain, depPath];
      const depFile = workspace.files[depPath];

      if (depFile && !depFile.isTest) {
        const epLabels = depFile.endpoints.map((e) => `${e.method} ${e.route}`);
        for (const ep of depFile.endpoints) {
          affectedApis.push({
            file: depPath,
            method: ep.method,
            route: ep.route,
            line: ep.line,
            hop: nextDepth,
          });
        }

        const severity: 'high' | 'medium' | 'low' =
          nextDepth === 1 && (depFile.endpoints.length > 0 || (revAdj.get(depPath)?.size || 0) >= 2)
            ? 'high'
            : nextDepth === 1
            ? 'medium'
            : 'low';

        const comp: ImpactedComponent = {
          path: depPath,
          depth: nextDepth,
          impactType: nextDepth === 1 ? 'direct' : 'transitive',
          impactPath: nextChain,
          severity,
          confidence: nextDepth === 1 ? 'high' : 'medium',
          reason:
            nextDepth === 1
              ? `Directly imports ${path.posix.basename(current.path)}${
                  targetSymbol ? ` (inspect references to ${targetSymbol})` : ''
                }.`
              : `Transitively depends on ${targetFile} via ${nextChain.slice(1, -1).join(' -> ')}.`,
          symbolsCount: depFile.symbols.length,
          endpoints: epLabels,
        };

        if (nextDepth === 1) directDependents.push(comp);
        else transitiveDependents.push(comp);
      }

      queue.push({ path: depPath, depth: nextDepth, pathChain: nextChain });
    }
  }

  // Associated tests (direct or transitive import of target or impacted files, or naming match)
  const impactedNonTestSet = new Set<string>([
    targetFile,
    ...directDependents.map((d) => d.path),
    ...transitiveDependents.map((d) => d.path),
  ]);
  const { testFiles } = discoverTestFiles(workspace);
  const associatedTests: ChangeImpactResult['associatedTests'] = [];
  const targetStem = path.posix.basename(targetFile, path.posix.extname(targetFile)).toLowerCase();

  for (const tf of testFiles) {
    const fileObj = workspace.files[tf.path];
    if (!fileObj) continue;
    if (fileObj.imports.includes(targetFile)) {
      associatedTests.push({
        path: tf.path,
        reason: `Directly imports ${targetFile}.`,
        priority: 'high',
        cases: tf.caseCount,
      });
    } else {
      const hitImpacted = fileObj.imports.find((imp) => impactedNonTestSet.has(imp));
      if (hitImpacted) {
        associatedTests.push({
          path: tf.path,
          reason: `Imports impacted downstream module ${hitImpacted}.`,
          priority: 'medium',
          cases: tf.caseCount,
        });
      } else if (targetStem.length > 2 && path.posix.basename(tf.path).toLowerCase().includes(targetStem)) {
        associatedTests.push({
          path: tf.path,
          reason: `Filename convention matches "${targetStem}".`,
          priority: 'low',
          cases: tf.caseCount,
        });
      }
    }
  }

  const nonTestCodeCount = Math.max(1, workspace.graph.nodes.filter((n) => !n.isTest).length);
  const totalAffected = directDependents.length + transitiveDependents.length;
  const blastRadiusPct = Number(((totalAffected / nonTestCodeCount) * 100).toFixed(1));
  const processingMs = Number((performance.now() - t0).toFixed(2));

  return {
    targetFile,
    targetSymbol,
    commitSha,
    changedSymbols: targetSymbol
      ? fileRec.symbols.filter((s) => s.name === targetSymbol)
      : fileRec.symbols,
    directDependents,
    transitiveDependents,
    affectedApis,
    associatedTests,
    directCount: directDependents.length,
    transitiveCount: transitiveDependents.length,
    totalAffected,
    blastRadiusPct,
    processingMs,
    limitationsNote:
      'Impact paths are derived from static import-graph traversal and naming heuristics. Dynamic dispatch, runtime reflection, or unparsed cross-service HTTP calls are not statically guaranteed.',
  };
}

// ============================================================================
// MODULE 5: TECHNICAL DEBT INTELLIGENCE
// ============================================================================
export function computeTechnicalDebt(workspace: RepoWorkspace): TechnicalDebtResult {
  const items: DebtItem[] = [];
  const secretRe =
    /([A-Za-z0-9_]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key)[A-Za-z0-9_]*)\s*[:=]\s*['"]([^'"\s]{6,})['"]/i;
  const placeholderRe = /(example|your[_-]|changeme|placeholder|xxx|<.*>|\$\{|os\.environ|getenv|dummy|test)/i;

  const nodeMap = new Map(workspace.graph.nodes.map((n) => [n.path, n]));

  // Sliding-window duplicate detector across non-test code files
  const blockMap = new Map<string, { path: string; line: number }[]>();

  for (const file of Object.values(workspace.files)) {
    const lines = file.content.split('\n');

    // 1. Verified deterministic static rules (preserving RepoMind review rules)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNo = i + 1;

      if (!file.isTest && /\b(eval|exec)\s*\(/.test(trimmed) && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        items.push({
          id: `verified:eval:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'security',
          severity: 'high',
          path: file.path,
          line: lineNo,
          title: 'Dynamic code execution (eval/exec)',
          explanation: 'Executing strings via eval() or exec() enables arbitrary code injection if inputs are untrusted.',
          suggestion: 'Replace with safe parsing (JSON.parse / ast.literal_eval) or an explicit dispatch map.',
          snippet: trimmed.slice(0, 180),
        });
      }

      if (/shell\s*=\s*True|child_process.*exec\(/i.test(trimmed) && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        items.push({
          id: `verified:shell:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'security',
          severity: 'high',
          path: file.path,
          line: lineNo,
          title: 'Shell-interpreted subprocess execution',
          explanation: 'Spawning commands through a shell risks command injection if arguments include external values.',
          suggestion: 'Use argument arrays with shell=False / execFile instead of shell string interpolation.',
          snippet: trimmed.slice(0, 180),
        });
      }

      if (/\.execute\s*\(\s*f['"]|\.execute\s*\(.*(\+|%\s|\.\s*format\()/.test(trimmed)) {
        items.push({
          id: `verified:sqli:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'security',
          severity: 'high',
          path: file.path,
          line: lineNo,
          title: 'Interpolated SQL query string',
          explanation: 'Building SQL statements with string formatting exposes the query to SQL injection.',
          suggestion: 'Use parameterized query placeholders instead of string interpolation.',
          snippet: trimmed.slice(0, 180),
        });
      }

      if (/verify\s*=\s*False/i.test(trimmed)) {
        items.push({
          id: `verified:tls:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'security',
          severity: 'high',
          path: file.path,
          line: lineNo,
          title: 'TLS certificate verification disabled',
          explanation: 'verify=False disables certificate validation and permits man-in-the-middle interception.',
          suggestion: 'Remove verify=False and supply a valid CA trust store.',
          snippet: trimmed.slice(0, 180),
        });
      }

      if (/^except\s*:/.test(trimmed) || /catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
        items.push({
          id: `verified:except:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'quality',
          severity: 'medium',
          path: file.path,
          line: lineNo,
          title: 'Bare except or empty catch block',
          explanation: 'Swallowing all exceptions hides failure causes and complicates incident triage.',
          suggestion: 'Catch explicit error types and log or propagate context.',
          snippet: trimmed.slice(0, 180),
        });
      }

      const secMatch = trimmed.match(secretRe);
      if (secMatch && !file.isTest && !placeholderRe.test(secMatch[2])) {
        items.push({
          id: `verified:secret:${file.path}:${lineNo}`,
          origin: 'verified_rule',
          category: 'security',
          severity: 'high',
          path: file.path,
          line: lineNo,
          title: `Hardcoded credential literal (${secMatch[1]})`,
          explanation: 'Credential-like string literals committed to source control risk accidental exposure.',
          suggestion: 'Load secrets from environment variables or a secret manager.',
          snippet: `${secMatch[1]} = "***redacted***"`,
        });
      }
    }

    if (file.isTest) continue;

    // 2. Heuristic Technical Debt Indicators
    if (file.lines > 300) {
      items.push({
        id: `heur:large:${file.path}`,
        origin: 'heuristic_indicator',
        category: 'size',
        severity: file.lines > 500 ? 'high' : 'medium',
        path: file.path,
        line: 1,
        title: `Large module (${file.lines} lines)`,
        explanation: `Files above 300 lines tend to accumulate mixed responsibilities and higher merge conflict rates.`,
        suggestion: 'Split cohesive responsibilities into dedicated modules.',
        snippet: `${file.lines} total lines · ${file.symbols.length} symbols`,
        metricValue: `${file.lines} LOC`,
      });
    }

    const node = nodeMap.get(file.path);
    if (node && (node.fanOut >= 6 || node.fanIn >= 6)) {
      items.push({
        id: `heur:coupling:${file.path}`,
        origin: 'heuristic_indicator',
        category: 'coupling',
        severity: node.fanOut >= 9 || node.fanIn >= 8 ? 'high' : 'medium',
        path: file.path,
        line: 1,
        title: `High structural coupling (fan-in ${node.fanIn}, fan-out ${node.fanOut})`,
        explanation: 'High fan-in/fan-out concentrates change propagation and increases architectural fragility.',
        suggestion: 'Introduce thin interfaces or split orchestration from domain primitives.',
        snippet: `Imports ${node.fanOut} modules · Imported by ${node.fanIn} modules`,
        metricValue: `fanIn=${node.fanIn}, fanOut=${node.fanOut}`,
      });
    }

    let undocumentedPublic = 0;
    for (const sym of file.symbols) {
      if (sym.complexity >= 8) {
        items.push({
          id: `heur:complex:${file.path}:${sym.name}:${sym.line}`,
          origin: 'heuristic_indicator',
          category: 'complexity',
          severity: sym.complexity >= 13 ? 'high' : 'medium',
          path: file.path,
          line: sym.line,
          title: `High cyclomatic complexity in ${sym.name}() (CC=${sym.complexity})`,
          explanation: 'Dense branching logic increases cognitive load and makes exhaustive branch testing harder.',
          suggestion: 'Extract branch predicates into smaller pure helpers with early returns.',
          snippet: `def/fn ${sym.name} · ${sym.lines} lines · CC=${sym.complexity}`,
          metricValue: `CC=${sym.complexity}`,
        });
      }
      if (sym.lines >= 45 && sym.kind !== 'class') {
        items.push({
          id: `heur:longfn:${file.path}:${sym.name}:${sym.line}`,
          origin: 'heuristic_indicator',
          category: 'size',
          severity: sym.lines >= 80 ? 'high' : 'low',
          path: file.path,
          line: sym.line,
          title: `Long function ${sym.name}() (${sym.lines} lines)`,
          explanation: 'Functions exceeding 45 lines often combine I/O, validation, and business rules.',
          suggestion: 'Decompose into smaller single-purpose steps.',
          snippet: `${sym.name} spans lines ${sym.line}–${sym.endLine}`,
          metricValue: `${sym.lines} lines`,
        });
      }
      if (sym.exported && !sym.hasDoc) {
        undocumentedPublic++;
      }
    }

    if (undocumentedPublic >= 3) {
      items.push({
        id: `heur:docs:${file.path}`,
        origin: 'heuristic_indicator',
        category: 'documentation',
        severity: 'low',
        path: file.path,
        line: 1,
        title: `Documentation gap (${undocumentedPublic} undocumented public symbols)`,
        explanation: 'Public functions/classes without docstrings or JSDoc slow onboarding and impact reviews.',
        suggestion: 'Document parameter contracts, side effects, and return invariants.',
        snippet: `${undocumentedPublic} of ${file.symbols.length} symbols lack doc comments`,
        metricValue: `${undocumentedPublic} undocumented`,
      });
    }

    // 5-line normalized duplicate block signature
    const normLines = lines.map((l) => l.trim()).filter((l) => l.length > 10 && !l.startsWith('import ') && !l.startsWith('from '));
    for (let idx = 0; idx <= normLines.length - 5; idx++) {
      const windowSig = normLines.slice(idx, idx + 5).join('\n');
      if (windowSig.length < 90) continue;
      const list = blockMap.get(windowSig) || [];
      if (list.length < 4) {
        list.push({ path: file.path, line: idx + 1 });
        blockMap.set(windowSig, list);
      }
    }
  }

  // Record cross-file duplicate candidates
  const seenDupPairs = new Set<string>();
  for (const [sig, locs] of blockMap.entries()) {
    const uniqueFiles = [...new Set(locs.map((l) => l.path))];
    if (uniqueFiles.length >= 2) {
      const pairKey = uniqueFiles.slice(0, 2).sort().join('|');
      if (seenDupPairs.has(pairKey)) continue;
      seenDupPairs.add(pairKey);
      items.push({
        id: `heur:dup:${pairKey}`,
        origin: 'heuristic_indicator',
        category: 'duplication',
        severity: 'medium',
        path: locs[0].path,
        line: locs[0].line,
        title: `Duplicate logic candidate across ${uniqueFiles.length} files`,
        explanation: `Similar 5-line code sequence appears in ${uniqueFiles.join(', ')}.`,
        suggestion: 'Consolidate shared logic into a single reusable utility module.',
        snippet: sig.split('\n')[0]?.slice(0, 140) || '',
      });
    }
  }

  const sevRank = { high: 3, medium: 2, low: 1 };
  items.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || a.path.localeCompare(b.path));

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};
  let verifiedCount = 0;
  let heuristicCount = 0;

  for (const item of items) {
    bySeverity[item.severity]++;
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (item.origin === 'verified_rule') verifiedCount++;
    else heuristicCount++;
  }

  return {
    totalFindings: items.length,
    verifiedCount,
    heuristicCount,
    bySeverity,
    byCategory,
    items,
  };
}

// ============================================================================
// MODULE 4: SOFTWARE RISK INTELLIGENCE
// ============================================================================
export function computeRiskIntelligence(
  workspace: RepoWorkspace,
  debtResult?: TechnicalDebtResult
): RiskSummaryResult {
  const debt = debtResult || computeTechnicalDebt(workspace);
  const hasGitData = workspace.git.available && workspace.git.commits.length > 0;
  const churnMap = new Map(workspace.git.fileChurn.map((c) => [c.path, c]));
  const nodeMap = new Map(workspace.graph.nodes.map((n) => [n.path, n]));
  const { testFiles } = discoverTestFiles(workspace);

  const codeFiles = Object.values(workspace.files).filter(
    (f) => !f.isTest && nodeMap.has(f.path)
  );

  const maxComplexity = Math.max(1, ...codeFiles.map((f) => f.maxComplexity));
  const maxChurn = Math.max(1, ...workspace.git.fileChurn.map((c) => c.churn));
  const maxDegree = Math.max(1, ...codeFiles.map((f) => (nodeMap.get(f.path)?.fanIn || 0) + (nodeMap.get(f.path)?.fanOut || 0)));

  const debtCountByFile = new Map<string, number>();
  for (const item of debt.items) {
    debtCountByFile.set(item.path, (debtCountByFile.get(item.path) || 0) + (item.severity === 'high' ? 2 : 1));
  }

  const rawEntries = codeFiles.map((file) => {
    const node = nodeMap.get(file.path);
    const churnStat = churnMap.get(file.path);
    const impact = computeChangeImpact(workspace, file.path);

    const directTested = testFiles.some((tf) => tf.directTargets.includes(file.path));
    const stem = path.posix.basename(file.path, path.posix.extname(file.path)).toLowerCase();
    const nameTested = testFiles.some((tf) => path.posix.basename(tf.path).toLowerCase().includes(stem));

    const testWeakness = directTested ? 15 : nameTested ? 45 : 95;
    const complexityNorm = Math.min(100, Math.round((file.maxComplexity / Math.max(12, maxComplexity)) * 100));
    const degree = (node?.fanIn || 0) + (node?.fanOut || 0);
    const exposureNorm = Math.min(
      100,
      Math.round(((degree / maxDegree) * 0.55 + Math.min(1, impact.totalAffected / Math.max(4, codeFiles.length * 0.5)) * 0.45) * 100)
    );
    const debtWeight = debtCountByFile.get(file.path) || 0;
    const debtSizeNorm = Math.min(100, Math.round(Math.min(1, debtWeight / 5) * 70 + Math.min(1, file.lines / 400) * 30));

    let factors: RiskFactor[];
    let score: number;

    if (hasGitData) {
      const rawChurn = churnStat?.churn || 0;
      const churnNorm = Math.min(100, Math.round((rawChurn / maxChurn) * 100));
      factors = [
        {
          name: 'Cyclomatic Complexity',
          weight: 0.25,
          rawValue: file.maxComplexity,
          normalized: complexityNorm,
          contribution: Number((0.25 * complexityNorm).toFixed(1)),
          detail: `Max complexity CC=${file.maxComplexity}`,
        },
        {
          name: 'Historical Churn',
          weight: 0.2,
          rawValue: rawChurn,
          normalized: churnNorm,
          contribution: Number((0.2 * churnNorm).toFixed(1)),
          detail: `${churnStat?.commits || 0} commits · ${rawChurn} changed lines`,
        },
        {
          name: 'Dependency & Blast Radius',
          weight: 0.2,
          rawValue: impact.totalAffected,
          normalized: exposureNorm,
          contribution: Number((0.2 * exposureNorm).toFixed(1)),
          detail: `fan-in ${node?.fanIn || 0}, fan-out ${node?.fanOut || 0}, ${impact.totalAffected} impacted modules`,
        },
        {
          name: 'Testing Weakness',
          weight: 0.2,
          rawValue: directTested ? 1 : 0,
          normalized: testWeakness,
          contribution: Number((0.2 * testWeakness).toFixed(1)),
          detail: directTested
            ? 'Direct static test import mapped'
            : nameTested
            ? 'Only filename heuristic test match'
            : 'No mapped unit/integration test found',
        },
        {
          name: 'Debt & Structural Size',
          weight: 0.15,
          rawValue: debtWeight,
          normalized: debtSizeNorm,
          contribution: Number((0.15 * debtSizeNorm).toFixed(1)),
          detail: `${debtWeight} weighted debt flags · ${file.lines} lines`,
        },
      ];
      score = Math.round(factors.reduce((s, x) => s + x.contribution, 0));
    } else {
      // Explicit missing-Git re-weighting (re-normalizes remaining 80% -> 100%)
      factors = [
        {
          name: 'Cyclomatic Complexity',
          weight: 0.31,
          rawValue: file.maxComplexity,
          normalized: complexityNorm,
          contribution: Number((0.31 * complexityNorm).toFixed(1)),
          detail: `Max complexity CC=${file.maxComplexity}`,
        },
        {
          name: 'Historical Churn',
          weight: 0,
          rawValue: null,
          normalized: 0,
          contribution: 0,
          detail: 'Unavailable (no .git history in archive)',
        },
        {
          name: 'Dependency & Blast Radius',
          weight: 0.25,
          rawValue: impact.totalAffected,
          normalized: exposureNorm,
          contribution: Number((0.25 * exposureNorm).toFixed(1)),
          detail: `fan-in ${node?.fanIn || 0}, fan-out ${node?.fanOut || 0}, ${impact.totalAffected} impacted modules`,
        },
        {
          name: 'Testing Weakness',
          weight: 0.25,
          rawValue: directTested ? 1 : 0,
          normalized: testWeakness,
          contribution: Number((0.25 * testWeakness).toFixed(1)),
          detail: directTested
            ? 'Direct static test import mapped'
            : nameTested
            ? 'Only filename heuristic test match'
            : 'No mapped test found',
        },
        {
          name: 'Debt & Structural Size',
          weight: 0.19,
          rawValue: debtWeight,
          normalized: debtSizeNorm,
          contribution: Number((0.19 * debtSizeNorm).toFixed(1)),
          detail: `${debtWeight} weighted debt flags · ${file.lines} lines`,
        },
      ];
      score = Math.round(factors.reduce((s, x) => s + x.contribution, 0));
    }

    const category: FileRiskScore['category'] =
      score >= 72 ? 'critical' : score >= 52 ? 'high' : score >= 32 ? 'medium' : 'low';

    const topFactors = [...factors]
      .filter((f) => f.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)
      .map((f) => `${f.name} (${f.detail})`);

    return {
      path: file.path,
      language: file.language,
      score,
      category,
      factors,
      explanation: `Primary drivers: ${topFactors.join('; ') || 'Minimal complexity and exposure'}.`,
      maxComplexity: file.maxComplexity,
      churn: churnStat?.churn ?? null,
      missingGitData: !hasGitData,
    };
  });

  // Compute ranks for baseline comparison (Experiment 3 & Risk Dashboard)
  const byComplexity = [...rawEntries].sort((a, b) => b.maxComplexity - a.maxComplexity || a.path.localeCompare(b.path));
  const complexityRankMap = new Map(byComplexity.map((e, i) => [e.path, i + 1]));

  const churnRankMap = new Map<string, number>();
  if (hasGitData) {
    const byChurn = [...rawEntries].sort((a, b) => (b.churn || 0) - (a.churn || 0) || a.path.localeCompare(b.path));
    byChurn.forEach((e, i) => churnRankMap.set(e.path, i + 1));
  }

  rawEntries.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const files: FileRiskScore[] = rawEntries.map((e, idx) => ({
    path: e.path,
    language: e.language,
    score: e.score,
    category: e.category,
    factors: e.factors,
    explanation: e.explanation,
    complexityRank: complexityRankMap.get(e.path) || idx + 1,
    churnRank: hasGitData ? churnRankMap.get(e.path) || idx + 1 : null,
    integratedRank: idx + 1,
    missingGitData: e.missingGitData,
  }));

  const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
  const dirAgg = new Map<string, { sum: number; max: number; count: number }>();

  for (const f of files) {
    distribution[f.category]++;
    const dir = path.posix.dirname(f.path) === '.' ? 'root' : path.posix.dirname(f.path);
    const cur = dirAgg.get(dir) || { sum: 0, max: 0, count: 0 };
    cur.sum += f.score;
    cur.max = Math.max(cur.max, f.score);
    cur.count += 1;
    dirAgg.set(dir, cur);
  }

  const directoryHotspots = [...dirAgg.entries()]
    .map(([directory, s]) => ({
      directory,
      avgRisk: Math.round(s.sum / s.count),
      maxRisk: s.max,
      fileCount: s.count,
    }))
    .sort((a, b) => b.avgRisk - a.avgRisk);

  const averageScore =
    files.length > 0 ? Math.round(files.reduce((s, f) => s + f.score, 0) / files.length) : 0;

  return {
    hasGitData,
    formulaDescription: hasGitData
      ? 'Provisional Integrated Risk = 0.25·Complexity + 0.20·GitChurn + 0.20·DependencyExposure + 0.20·TestingWeakness + 0.15·DebtAndSize'
      : 'Provisional Static-Only Fallback (Git unavailable) = 0.31·Complexity + 0.25·DependencyExposure + 0.25·TestingWeakness + 0.19·DebtAndSize',
    assumptions: [
      'Weights are provisional engineering priors rather than universal empirically fitted constants; validate via Research Evaluation (Experiment 3).',
      'Testing weakness reflects static import and filename mapping, not runtime line-coverage instrumentation.',
      hasGitData
        ? 'Git churn sums additions and deletions over extracted commit history.'
        : 'Git churn is explicitly marked unavailable and omitted from normalization when .git history is absent.',
    ],
    distribution,
    averageScore,
    files,
    directoryHotspots,
  };
}

// ============================================================================
// MODULE 6: TEST IMPACT INTELLIGENCE
// ============================================================================
export function computeTestImpact(
  workspace: RepoWorkspace,
  targetFile: string | null = null,
  riskSummary?: RiskSummaryResult
): TestImpactResult {
  const { frameworks, testFiles, totalCases } = discoverTestFiles(workspace);
  const risk = riskSummary || computeRiskIntelligence(workspace);
  const riskMap = new Map(risk.files.map((f) => [f.path, f.category]));

  const testedSet = new Set<string>();
  for (const tf of testFiles) {
    for (const t of tf.directTargets) testedSet.add(t);
  }

  const untestedModules: TestImpactResult['untestedModules'] = [];
  const nonTestNodes = workspace.graph.nodes.filter((n) => !n.isTest && n.functions + n.classes > 0);
  for (const node of nonTestNodes) {
    const stem = path.posix.basename(node.path, path.posix.extname(node.path)).toLowerCase();
    const byName = testFiles.some((tf) => path.posix.basename(tf.path).toLowerCase().includes(stem));
    if (!testedSet.has(node.path) && !byName) {
      untestedModules.push({
        path: node.path,
        functions: node.functions,
        classes: node.classes,
        lines: node.lines,
        riskCategory: riskMap.get(node.path) || 'low',
      });
    }
  }
  untestedModules.sort((a, b) => b.functions + b.classes - (a.functions + a.classes));

  const coverageRatioPct =
    nonTestNodes.length > 0
      ? Number((((nonTestNodes.length - untestedModules.length) / nonTestNodes.length) * 100).toFixed(1))
      : 100;

  let recommendations: TestRecommendation[] = [];
  if (targetFile && workspace.files[targetFile]) {
    const impact = computeChangeImpact(workspace, targetFile);
    const impactedFiles = new Set([
      targetFile,
      ...impact.directDependents.map((d) => d.path),
      ...impact.transitiveDependents.map((d) => d.path),
    ]);
    const targetStem = path.posix.basename(targetFile, path.posix.extname(targetFile)).toLowerCase();

    const scored: Omit<TestRecommendation, 'rank'>[] = [];
    for (const tf of testFiles) {
      const fileObj = workspace.files[tf.path];
      if (!fileObj) continue;

      if (fileObj.imports.includes(targetFile)) {
        scored.push({
          testPath: tf.path,
          score: 95,
          matchType: 'direct_import',
          reason: `Directly imports ${targetFile}.`,
          caseCount: tf.caseCount,
          matchedSourceFiles: [targetFile],
        });
      } else {
        const matched = fileObj.imports.filter((imp) => impactedFiles.has(imp));
        if (matched.length > 0) {
          scored.push({
            testPath: tf.path,
            score: Math.min(85, 65 + matched.length * 8),
            matchType: 'transitive_dependency',
            reason: `Exercises impacted downstream dependency: ${matched.join(', ')}.`,
            caseCount: tf.caseCount,
            matchedSourceFiles: matched,
          });
        } else if (targetStem.length > 2 && path.posix.basename(tf.path).toLowerCase().includes(targetStem)) {
          scored.push({
            testPath: tf.path,
            score: 50,
            matchType: 'naming_convention',
            reason: `Test filename matches "${targetStem}".`,
            caseCount: tf.caseCount,
            matchedSourceFiles: [targetFile],
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score || b.caseCount - a.caseCount);
    recommendations = scored.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  const allTestsCount = testFiles.length;
  const recommendedTestsCount = recommendations.length;
  const reductionPct =
    allTestsCount > 0 && targetFile
      ? Number((((allTestsCount - recommendedTestsCount) / allTestsCount) * 100).toFixed(1))
      : 0;

  return {
    frameworks,
    testFiles,
    totalCases,
    untestedModules,
    coverageRatioPct,
    selectedTarget: targetFile,
    recommendations,
    allTestsCount,
    recommendedTestsCount,
    reductionPct,
    note: 'Test-to-source mapping uses static import graph analysis and filename conventions. Untrusted repository tests are never executed on the host.',
  };
}

// ============================================================================
// MODULE 7: ARCHITECTURE EVOLUTION INTELLIGENCE
// ============================================================================
export async function computeArchitectureEvolution(
  workspace: RepoWorkspace,
  baseRef: string,
  headRef: string
): Promise<ArchEvolutionResult> {
  if (!workspace.git.available) {
    throw new Error('Git history is required to compare historical architecture snapshots.');
  }

  const tempBase = path.join(WORKSPACE_ROOT, `snap-${workspace.meta.id}-base`);
  const tempHead = path.join(WORKSPACE_ROOT, `snap-${workspace.meta.id}-head`);

  try {
    await extractRefSnapshot(workspace.rootDir, baseRef, tempBase);
    await extractRefSnapshot(workspace.rootDir, headRef, tempHead);

    const baseScan = scanRepository(tempBase);
    const headScan = scanRepository(tempHead);

    const baseNodeSet = new Set(baseScan.graph.nodes.map((n) => n.path));
    const headNodeSet = new Set(headScan.graph.nodes.map((n) => n.path));

    const addedModules = [...headNodeSet].filter((p) => !baseNodeSet.has(p)).sort();
    const removedModules = [...baseNodeSet].filter((p) => !headNodeSet.has(p)).sort();

    const edgeKey = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`;
    const baseEdgeMap = new Map(baseScan.graph.edges.map((e) => [edgeKey(e), e]));
    const headEdgeMap = new Map(headScan.graph.edges.map((e) => [edgeKey(e), e]));

    const addedEdges = [...headEdgeMap.entries()]
      .filter(([k]) => !baseEdgeMap.has(k))
      .map(([, e]) => ({ source: e.source, target: e.target }));
    const removedEdges = [...baseEdgeMap.entries()]
      .filter(([k]) => !headEdgeMap.has(k))
      .map(([, e]) => ({ source: e.source, target: e.target }));

    const cycKey = (m: string[]) => [...m].sort().join('|');
    const baseCycleKeys = new Set(baseScan.graph.cycles.map((c) => cycKey(c.modules)));
    const headCycleKeys = new Set(headScan.graph.cycles.map((c) => cycKey(c.modules)));

    const newCycles = headScan.graph.cycles
      .filter((c) => !baseCycleKeys.has(cycKey(c.modules)))
      .map((c) => c.path);
    const resolvedCycles = baseScan.graph.cycles
      .filter((c) => !headCycleKeys.has(cycKey(c.modules)))
      .map((c) => c.path);

    const baseAvgDeg =
      baseScan.graph.nodes.length > 0
        ? Number((baseScan.graph.edges.length / baseScan.graph.nodes.length).toFixed(2))
        : 0;
    const headAvgDeg =
      headScan.graph.nodes.length > 0
        ? Number((headScan.graph.edges.length / headScan.graph.nodes.length).toFixed(2))
        : 0;
    const couplingDelta = Number((headAvgDeg - baseAvgDeg).toFixed(2));

    return {
      baseRef,
      headRef,
      baseStats: {
        nodes: baseScan.graph.nodes.length,
        edges: baseScan.graph.edges.length,
        cycles: baseScan.graph.cycles.length,
        avgDegree: baseAvgDeg,
      },
      headStats: {
        nodes: headScan.graph.nodes.length,
        edges: headScan.graph.edges.length,
        cycles: headScan.graph.cycles.length,
        avgDegree: headAvgDeg,
      },
      addedModules,
      removedModules,
      addedEdges,
      removedEdges,
      newCycles,
      resolvedCycles,
      couplingDelta,
      summary: `Between ${baseRef} and ${headRef}: +${addedModules.length}/-${removedModules.length} modules, +${addedEdges.length}/-${removedEdges.length} internal import edges, coupling delta ${couplingDelta >= 0 ? '+' : ''}${couplingDelta} edges/module.`,
    };
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
    fs.rmSync(tempHead, { recursive: true, force: true });
  }
}

// ============================================================================
// MODULE 9: DEVELOPER KNOWLEDGE INTELLIGENCE
// ============================================================================
export function computeContributorKnowledge(workspace: RepoWorkspace): ContributorKnowledgeResult {
  if (!workspace.git.available || workspace.git.commits.length === 0) {
    return {
      available: false,
      disclaimer: 'Commit counts reflect repository activity concentration only and do not measure individual skill or expertise.',
      contributors: [],
      fileConcentration: [],
      singleOwnerFilesCount: 0,
      note: 'Git history is required for contributor activity intelligence.',
    };
  }

  const contribMap = new Map<
    string,
    {
      author: string;
      email: string;
      commits: number;
      additions: number;
      deletions: number;
      files: Set<string>;
      dirs: Map<string, number>;
      firstCommit: string;
      lastCommit: string;
    }
  >();

  const fileAuthors = new Map<string, Map<string, number>>();

  for (const commit of workspace.git.commits) {
    const key = commit.author;
    const cur = contribMap.get(key) || {
      author: commit.author,
      email: commit.email,
      commits: 0,
      additions: 0,
      deletions: 0,
      files: new Set<string>(),
      dirs: new Map<string, number>(),
      firstCommit: commit.date,
      lastCommit: commit.date,
    };

    cur.commits += 1;
    cur.additions += commit.additions;
    cur.deletions += commit.deletions;
    if (commit.date < cur.firstCommit) cur.firstCommit = commit.date;
    if (commit.date > cur.lastCommit) cur.lastCommit = commit.date;

    for (const f of commit.files) {
      cur.files.add(f.path);
      const dir = path.posix.dirname(f.path) === '.' ? 'root' : path.posix.dirname(f.path);
      cur.dirs.set(dir, (cur.dirs.get(dir) || 0) + 1);

      if (!fileAuthors.has(f.path)) fileAuthors.set(f.path, new Map());
      const fa = fileAuthors.get(f.path)!;
      fa.set(commit.author, (fa.get(commit.author) || 0) + 1);
    }

    contribMap.set(key, cur);
  }

  const totalCommits = workspace.git.commits.length;
  const contributors: ContributorStat[] = [...contribMap.values()]
    .map((c) => ({
      author: c.author,
      email: c.email,
      commits: c.commits,
      sharePct: Number(((c.commits / totalCommits) * 100).toFixed(1)),
      additions: c.additions,
      deletions: c.deletions,
      filesTouched: c.files.size,
      topDirectories: [...c.dirs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([directory, commits]) => ({ directory, commits })),
      firstCommit: c.firstCommit,
      lastCommit: c.lastCommit,
    }))
    .sort((a, b) => b.commits - a.commits);

  const fileConcentration: KnowledgeConcentration[] = [];
  for (const [filePath, authorCounts] of fileAuthors.entries()) {
    if (!workspace.files[filePath]) continue;
    const total = [...authorCounts.values()].reduce((s, n) => s + n, 0);
    const sorted = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topAuthor = sorted[0][0];
    const topAuthorSharePct = Math.round((sorted[0][1] / total) * 100);
    const concentrationLevel: KnowledgeConcentration['concentrationLevel'] =
      sorted.length === 1 ? 'single_owner' : topAuthorSharePct >= 70 ? 'concentrated' : 'shared';

    fileConcentration.push({
      path: filePath,
      totalCommits: total,
      topAuthor,
      topAuthorSharePct,
      authorCount: sorted.length,
      concentrationLevel,
    });
  }

  fileConcentration.sort((a, b) => b.topAuthorSharePct - a.topAuthorSharePct || b.totalCommits - a.totalCommits);

  return {
    available: true,
    disclaimer: 'Commit distribution reflects historical edit concentration (bus-factor risk) and never measures developer competence or skill.',
    contributors,
    fileConcentration,
    singleOwnerFilesCount: fileConcentration.filter((f) => f.concentrationLevel === 'single_owner').length,
  };
}

// ============================================================================
// MODULE 10: PROJECT HEALTH DASHBOARD
// ============================================================================
export function computeProjectHealth(workspace: RepoWorkspace): ProjectHealthResult {
  const debt = computeTechnicalDebt(workspace);
  const risk = computeRiskIntelligence(workspace, debt);
  const testImpact = computeTestImpact(workspace, null, risk);

  const riskHealth = Math.max(0, 100 - risk.averageScore);
  const testHealth = Math.round(testImpact.coverageRatioPct);
  const cyclePenalty = Math.min(40, workspace.graph.cycles.length * 15);
  const avgDeg =
    workspace.graph.nodes.length > 0
      ? workspace.graph.edges.length / workspace.graph.nodes.length
      : 0;
  const archHealth = Math.max(0, Math.round(100 - cyclePenalty - Math.max(0, avgDeg - 2) * 10));

  const codeFilesCount = Math.max(1, workspace.graph.nodes.filter((n) => !n.isTest).length);
  const debtDensity = (debt.bySeverity.high * 3 + debt.bySeverity.medium * 1.5 + debt.bySeverity.low * 0.5) / codeFilesCount;
  const debtHealth = Math.max(0, Math.round(100 - Math.min(100, debtDensity * 18)));

  const dimensions = [
    {
      name: 'Risk Stability',
      score: riskHealth,
      weight: 0.3,
      formula: '100 - Mean File Risk Score',
      detail: `Average module risk ${risk.averageScore}/100 across ${risk.files.length} source files`,
    },
    {
      name: 'Test Mapping Coverage',
      score: testHealth,
      weight: 0.25,
      formula: 'Mapped Source Modules / Total Non-Test Modules × 100',
      detail: `${testImpact.coverageRatioPct}% of code modules statically linked to ${testImpact.testFiles.length} test files`,
    },
    {
      name: 'Technical Debt Cleanliness',
      score: debtHealth,
      weight: 0.25,
      formula: '100 - min(100, Weighted Debt Density × 18)',
      detail: `${debt.bySeverity.high} high, ${debt.bySeverity.medium} medium, ${debt.bySeverity.low} low findings`,
    },
    {
      name: 'Architectural Modularity',
      score: archHealth,
      weight: 0.2,
      formula: '100 - Cycle Penalty - Excess Coupling Penalty',
      detail: `${workspace.graph.cycles.length} cycles · avg ${avgDeg.toFixed(2)} edges/module`,
    },
  ];

  const overallScore = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));
  const grade: ProjectHealthResult['grade'] =
    overallScore >= 85 ? 'A' : overallScore >= 72 ? 'B' : overallScore >= 58 ? 'C' : overallScore >= 42 ? 'D' : 'F';

  // Directory heatmap
  const dirSet = new Set(Object.values(workspace.files).map((f) => f.dir));
  const churnMap = new Map(workspace.git.fileChurn.map((c) => [c.path, c.churn]));
  const riskFileMap = new Map(risk.files.map((f) => [f.path, f.score]));
  const untestedSet = new Set(testImpact.untestedModules.map((u) => u.path));

  const heatmap = [...dirSet]
    .map((dir) => {
      const dirFiles = Object.values(workspace.files).filter((f) => f.dir === dir);
      const nonTest = dirFiles.filter((f) => !f.isTest && workspace.graph.nodes.some((n) => n.path === f.path));
      const riskScores = nonTest.map((f) => riskFileMap.get(f.path) ?? 0);
      const avgRisk = riskScores.length > 0 ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length) : 0;
      const debtItems = debt.items.filter((d) => dirFiles.some((f) => f.path === d.path)).length;
      const tested = nonTest.filter((f) => !untestedSet.has(f.path)).length;
      const testCoveragePct = nonTest.length > 0 ? Math.round((tested / nonTest.length) * 100) : 100;
      const churn = dirFiles.reduce((s, f) => s + (churnMap.get(f.path) || 0), 0);
      return {
        directory: dir,
        files: dirFiles.length,
        lines: dirFiles.reduce((s, f) => s + f.lines, 0),
        avgRisk,
        debtItems,
        testCoveragePct,
        churn,
      };
    })
    .sort((a, b) => b.avgRisk - a.avgRisk || b.debtItems - a.debtItems);

  const prioritizedActions: ProjectHealthResult['prioritizedActions'] = [];
  for (const item of debt.items.filter((d) => d.origin === 'verified_rule' && d.severity === 'high').slice(0, 2)) {
    prioritizedActions.push({
      priority: 'high',
      title: item.title,
      target: `${item.path}:${item.line}`,
      rationale: item.explanation,
    });
  }
  for (const risky of risk.files.filter((f) => f.category === 'critical' || f.category === 'high').slice(0, 2)) {
    prioritizedActions.push({
      priority: 'high',
      title: `Mitigate high risk in ${path.posix.basename(risky.path)} (score ${risky.score}/100)`,
      target: risky.path,
      rationale: risky.explanation,
    });
  }
  for (const unt of testImpact.untestedModules.slice(0, 2)) {
    prioritizedActions.push({
      priority: 'medium',
      title: `Add test coverage for ${unt.path}`,
      target: unt.path,
      rationale: `Contains ${unt.functions} functions and ${unt.classes} classes with no mapped test file.`,
    });
  }

  return { overallScore, grade, dimensions, heatmap, prioritizedActions };
}

// ============================================================================
// MODULE 11: COMPARATIVE REPOSITORY ANALYSIS
// ============================================================================
export async function compareGitRefsSummary(
  workspace: RepoWorkspace,
  leftRef: string,
  rightRef: string
): Promise<RepoComparisonResult> {
  if (!workspace.git.available) {
    throw new Error('Git history is required to compare two refs of the same repository.');
  }
  const tempLeft = path.join(WORKSPACE_ROOT, `cmp-${workspace.meta.id}-left`);
  const tempRight = path.join(WORKSPACE_ROOT, `cmp-${workspace.meta.id}-right`);

  try {
    await extractRefSnapshot(workspace.rootDir, leftRef, tempLeft);
    await extractRefSnapshot(workspace.rootDir, rightRef, tempRight);

    const leftScan = scanRepository(tempLeft);
    const rightScan = scanRepository(tempRight);

    const leftMockWs: RepoWorkspace = {
      ...workspace,
      tree: leftScan.tree,
      files: leftScan.files,
      graph: leftScan.graph,
      git: { ...workspace.git, available: false, commits: [], fileChurn: [] },
    };
    const rightMockWs: RepoWorkspace = {
      ...workspace,
      tree: rightScan.tree,
      files: rightScan.files,
      graph: rightScan.graph,
      git: { ...workspace.git, available: false, commits: [], fileChurn: [] },
    };

    const leftDebt = computeTechnicalDebt(leftMockWs);
    const rightDebt = computeTechnicalDebt(rightMockWs);
    const leftRisk = computeRiskIntelligence(leftMockWs, leftDebt);
    const rightRisk = computeRiskIntelligence(rightMockWs, rightDebt);
    const leftTest = computeTestImpact(leftMockWs, null, leftRisk);
    const rightTest = computeTestImpact(rightMockWs, null, rightRisk);

    return buildComparisonPayload(
      'git_refs',
      leftRef,
      rightRef,
      leftScan,
      rightScan,
      leftRisk,
      rightRisk,
      leftDebt,
      rightDebt,
      leftTest,
      rightTest
    );
  } finally {
    fs.rmSync(tempLeft, { recursive: true, force: true });
    fs.rmSync(tempRight, { recursive: true, force: true });
  }
}

export function compareTwoWorkspaces(left: RepoWorkspace, right: RepoWorkspace): RepoComparisonResult {
  const leftDebt = computeTechnicalDebt(left);
  const rightDebt = computeTechnicalDebt(right);
  const leftRisk = computeRiskIntelligence(left, leftDebt);
  const rightRisk = computeRiskIntelligence(right, rightDebt);
  const leftTest = computeTestImpact(left, null, leftRisk);
  const rightTest = computeTestImpact(right, null, rightRisk);

  return buildComparisonPayload(
    'repositories',
    left.meta.name,
    right.meta.name,
    {
      totalFiles: left.meta.totalFiles,
      totalLines: left.meta.totalLines,
      totalSymbols: left.meta.totalSymbols,
      files: left.files,
      graph: left.graph,
    },
    {
      totalFiles: right.meta.totalFiles,
      totalLines: right.meta.totalLines,
      totalSymbols: right.meta.totalSymbols,
      files: right.files,
      graph: right.graph,
    },
    leftRisk,
    rightRisk,
    leftDebt,
    rightDebt,
    leftTest,
    rightTest
  );
}

function buildComparisonPayload(
  mode: 'git_refs' | 'repositories',
  leftLabel: string,
  rightLabel: string,
  leftScan: Pick<RepoWorkspace, 'files' | 'graph'> & { totalFiles: number; totalLines: number; totalSymbols: number },
  rightScan: Pick<RepoWorkspace, 'files' | 'graph'> & { totalFiles: number; totalLines: number; totalSymbols: number },
  leftRisk: RiskSummaryResult,
  rightRisk: RiskSummaryResult,
  leftDebt: TechnicalDebtResult,
  rightDebt: TechnicalDebtResult,
  leftTest: TestImpactResult,
  rightTest: TestImpactResult
): RepoComparisonResult {
  const fmtDelta = (a: number, b: number, suffix = '') => {
    const d = Number((b - a).toFixed(1));
    return `${d >= 0 ? '+' : ''}${d}${suffix}`;
  };

  const metrics: RepoComparisonResult['metrics'] = [
    { metric: 'Total Files', leftValue: leftScan.totalFiles, rightValue: rightScan.totalFiles, delta: fmtDelta(leftScan.totalFiles, rightScan.totalFiles) },
    { metric: 'Total Lines of Code', leftValue: leftScan.totalLines, rightValue: rightScan.totalLines, delta: fmtDelta(leftScan.totalLines, rightScan.totalLines) },
    { metric: 'Parsed Symbols', leftValue: leftScan.totalSymbols, rightValue: rightScan.totalSymbols, delta: fmtDelta(leftScan.totalSymbols, rightScan.totalSymbols) },
    { metric: 'Internal Dependency Edges', leftValue: leftScan.graph.edges.length, rightValue: rightScan.graph.edges.length, delta: fmtDelta(leftScan.graph.edges.length, rightScan.graph.edges.length) },
    { metric: 'Circular Dependencies', leftValue: leftScan.graph.cycles.length, rightValue: rightScan.graph.cycles.length, delta: fmtDelta(leftScan.graph.cycles.length, rightScan.graph.cycles.length) },
    { metric: 'Mean Static Risk Score', leftValue: leftRisk.averageScore, rightValue: rightRisk.averageScore, delta: fmtDelta(leftRisk.averageScore, rightRisk.averageScore) },
    { metric: 'Technical Debt Findings', leftValue: leftDebt.totalFindings, rightValue: rightDebt.totalFindings, delta: fmtDelta(leftDebt.totalFindings, rightDebt.totalFindings) },
    { metric: 'Test Mapping Coverage (%)', leftValue: `${leftTest.coverageRatioPct}%`, rightValue: `${rightTest.coverageRatioPct}%`, delta: fmtDelta(leftTest.coverageRatioPct, rightTest.coverageRatioPct, '%') },
  ];

  const allPaths = new Set([...Object.keys(leftScan.files), ...Object.keys(rightScan.files)]);
  const fileChanges: RepoComparisonResult['fileChanges'] = [];
  for (const p of [...allPaths].sort()) {
    const lf = leftScan.files[p];
    const rf = rightScan.files[p];
    if (!lf && rf) fileChanges.push({ path: p, status: 'added', linesDelta: rf.lines });
    else if (lf && !rf) fileChanges.push({ path: p, status: 'removed', linesDelta: -lf.lines });
    else if (lf && rf && lf.lines !== rf.lines) {
      fileChanges.push({ path: p, status: 'modified', linesDelta: rf.lines - lf.lines });
    }
  }

  const edgeSet = (g: RepoWorkspace['graph']) => new Set(g.edges.map((e) => `${e.source}->${e.target}`));
  const lEdges = edgeSet(leftScan.graph);
  const rEdges = edgeSet(rightScan.graph);
  const addedEdges = [...rEdges].filter((e) => !lEdges.has(e)).length;
  const removedEdges = [...lEdges].filter((e) => !rEdges.has(e)).length;

  return {
    mode,
    leftLabel,
    rightLabel,
    metrics,
    fileChanges: fileChanges.slice(0, 60),
    dependencyChanges: {
      addedEdges,
      removedEdges,
      cycleDelta: rightScan.graph.cycles.length - leftScan.graph.cycles.length,
    },
    summary: `Comparison of ${leftLabel} vs ${rightLabel}: ${fileChanges.length} changed files, ${fmtDelta(leftScan.totalLines, rightScan.totalLines)} LOC, mean risk delta ${fmtDelta(leftRisk.averageScore, rightRisk.averageScore)}.`,
  };
}

// ============================================================================
// MODULE 12: RESEARCH EVALUATION & REPORTS
// ============================================================================
function spearmanCorrelation(ranksA: number[], ranksB: number[]): number {
  const n = ranksA.length;
  if (n < 2) return 1;
  let d2Sum = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksA[i] - ranksB[i];
    d2Sum += d * d;
  }
  const rho = 1 - (6 * d2Sum) / (n * (n * n - 1));
  return Number(rho.toFixed(3));
}

export async function runResearchEvaluation(workspace: RepoWorkspace): Promise<ResearchEvaluationResult> {
  // Experiment 1: Git CLI accuracy verification
  let exp1: ResearchEvaluationResult['experiment1GitAccuracy'];
  if (workspace.git.available) {
    const cli = await getRawGitCliVerificationStats(workspace.rootDir);
    const parsedFileOpsCount = workspace.git.commits.reduce((s, c) => s + c.files.length, 0);
    const additionsParsed = workspace.git.commits.reduce((s, c) => s + c.additions, 0);
    const deletionsParsed = workspace.git.commits.reduce((s, c) => s + c.deletions, 0);
    const commitMatchPct =
      cli.cliCommitCount > 0
        ? Number(((workspace.git.totalCommits / cli.cliCommitCount) * 100).toFixed(1))
        : 100;
    exp1 = {
      available: true,
      cliCommitCount: cli.cliCommitCount,
      parsedCommitCount: workspace.git.totalCommits,
      commitMatchPct,
      cliFileOpsCount: cli.cliFileOpsCount,
      parsedFileOpsCount,
      additionsCli: cli.additionsCli,
      additionsParsed,
      deletionsCli: cli.deletionsCli,
      deletionsParsed,
      extractionMs: workspace.git.extractionMs,
      note: 'Verified parsed commit records directly against raw `git rev-list --count` and `git log --shortstat`.',
    };
  } else {
    exp1 = {
      available: false,
      cliCommitCount: 0,
      parsedCommitCount: 0,
      commitMatchPct: 0,
      cliFileOpsCount: 0,
      parsedFileOpsCount: 0,
      additionsCli: 0,
      additionsParsed: 0,
      deletionsCli: 0,
      deletionsParsed: 0,
      extractionMs: 0,
      note: 'Skipped: active repository was ingested via ZIP archive without .git history.',
    };
  }

  // Experiment 2: Direct vs Transitive Change Impact across top code modules
  const candidateFiles = workspace.graph.nodes
    .filter((n) => !n.isTest)
    .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
    .slice(0, 10);

  const impactSamples = candidateFiles.map((n) => {
    const res = computeChangeImpact(workspace, n.path);
    return {
      file: n.path,
      direct: res.directCount,
      transitive: res.transitiveCount,
      testsMatched: res.associatedTests.length,
      ms: res.processingMs,
    };
  });

  const avgDirect =
    impactSamples.length > 0
      ? Number((impactSamples.reduce((s, x) => s + x.direct, 0) / impactSamples.length).toFixed(2))
      : 0;
  const avgTransitive =
    impactSamples.length > 0
      ? Number((impactSamples.reduce((s, x) => s + x.transitive, 0) / impactSamples.length).toFixed(2))
      : 0;
  const avgImpactMs =
    impactSamples.length > 0
      ? Number((impactSamples.reduce((s, x) => s + x.ms, 0) / impactSamples.length).toFixed(2))
      : 0;

  // Experiment 3: Integrated Risk vs Complexity-Only & Churn-Only baselines
  const risk = computeRiskIntelligence(workspace);
  const integratedRanks = risk.files.map((f) => f.integratedRank);
  const complexityRanks = risk.files.map((f) => f.complexityRank);
  const churnRanks = risk.files.map((f) => f.churnRank ?? f.integratedRank);

  const spearmanVsComplexity = spearmanCorrelation(integratedRanks, complexityRanks);
  const spearmanVsChurn = risk.hasGitData ? spearmanCorrelation(integratedRanks, churnRanks) : null;

  const k = Math.min(5, risk.files.length);
  const topKIntegrated = new Set(risk.files.slice(0, k).map((f) => f.path));
  const topKComplexity = new Set(
    [...risk.files].sort((a, b) => a.complexityRank - b.complexityRank).slice(0, k).map((f) => f.path)
  );
  const top5OverlapWithComplexity = [...topKIntegrated].filter((p) => topKComplexity.has(p)).length;

  let top5OverlapWithChurn: number | null = null;
  if (risk.hasGitData) {
    const topKChurn = new Set(
      [...risk.files].sort((a, b) => (a.churnRank || 999) - (b.churnRank || 999)).slice(0, k).map((f) => f.path)
    );
    top5OverlapWithChurn = [...topKIntegrated].filter((p) => topKChurn.has(p)).length;
  }

  // Experiment 4: Test Impact selection reduction vs All-Tests baseline
  const { testFiles } = discoverTestFiles(workspace);
  const testRuns = candidateFiles.map((n) => computeTestImpact(workspace, n.path, risk));
  const avgRecommendedTests =
    testRuns.length > 0
      ? Number((testRuns.reduce((s, t) => s + t.recommendedTestsCount, 0) / testRuns.length).toFixed(2))
      : 0;
  const avgReductionPct =
    testRuns.length > 0
      ? Number((testRuns.reduce((s, t) => s + t.reductionPct, 0) / testRuns.length).toFixed(1))
      : 0;
  const filesWithZeroStaticTestMatch = testRuns.filter((t) => t.recommendedTestsCount === 0).length;

  return {
    researchQuestion:
      'Can a repository evolution intelligence framework combining Git history, structural dependencies, code complexity, and testing information improve the identification and prioritisation of potentially risky software changes?',
    repositoryId: workspace.meta.id,
    repositoryName: workspace.meta.name,
    timestamp: new Date().toISOString(),
    experiment1GitAccuracy: exp1,
    experiment2ImpactAnalysis: {
      evaluatedFiles: impactSamples.length,
      avgDirectImpacted: avgDirect,
      avgTransitiveImpacted: avgTransitive,
      transitiveExpansionFactor:
        avgDirect > 0 ? Number(((avgDirect + avgTransitive) / avgDirect).toFixed(2)) : 1,
      avgProcessingMs: avgImpactMs,
      samples: impactSamples,
    },
    experiment3RiskPrioritisation: {
      evaluatedFiles: risk.files.length,
      spearmanVsComplexity,
      spearmanVsChurn,
      top5OverlapWithComplexity,
      top5OverlapWithChurn,
      topRiskFiles: risk.files.slice(0, 8).map((f) => ({
        file: f.path,
        integratedScore: f.score,
        integratedRank: f.integratedRank,
        complexityRank: f.complexityRank,
        churnRank: f.churnRank,
      })),
    },
    experiment4TestImpact: {
      evaluatedFiles: testRuns.length,
      totalTestFiles: testFiles.length,
      avgRecommendedTests,
      avgReductionPct,
      filesWithZeroStaticTestMatch,
    },
    experiment5Performance: {
      totalFiles: workspace.meta.totalFiles,
      totalLines: workspace.meta.totalLines,
      totalCommits: workspace.git.totalCommits,
      dependencyEdges: workspace.graph.edges.length,
      cyclesDetected: workspace.graph.cycles.length,
      scanAndAstMs: workspace.meta.analysisMs,
      gitExtractionMs: workspace.git.extractionMs,
      heapUsedMb: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1)),
    },
  };
}

export async function buildMarkdownReport(workspace: RepoWorkspace): Promise<string> {
  const generatedAt = new Date().toISOString();
  const debt = computeTechnicalDebt(workspace);
  const risk = computeRiskIntelligence(workspace, debt);
  const testImpact = computeTestImpact(workspace, null, risk);
  const health = computeProjectHealth(workspace);
  const evalData = await runResearchEvaluation(workspace);

  const avgDeg =
    workspace.graph.nodes.length > 0
      ? (workspace.graph.edges.length / workspace.graph.nodes.length).toFixed(2)
      : '0.00';
  const topLanguages = workspace.meta.languages
    .slice(0, 5)
    .map((l) => `${l.language} (${l.percentage}%)`)
    .join(', ');

  const lines: string[] = [
    `# RepoMind Evolution — Stakeholder Intelligence Summary`,
    ``,
    `**Repository:** \`${workspace.meta.name}\`  `,
    `**Generated:** ${generatedAt}  `,
    `**Source:** ${workspace.meta.source} (\`${workspace.meta.sourceRef}\`)`,
    ``,
    `---`,
    ``,
    `## 1. Executive Workspace Overview`,
    `- **Scale:** ${workspace.meta.totalFiles} files · ${workspace.meta.totalLines.toLocaleString()} LOC · ${workspace.meta.totalSymbols} parsed symbols`,
    `- **Languages:** ${topLanguages || 'Unknown'}`,
    `- **Frameworks / Tooling:** ${workspace.meta.frameworks.join(', ') || 'None detected'}`,
    `- **Git History:** ${workspace.meta.hasGitHistory ? `${workspace.meta.commitCount} commits indexed` : 'ZIP snapshot (Git history unavailable)'}`,
    ``,
    `## 2. Project Health Status`,
    `- **Composite Score:** **${health.overallScore}/100 (Grade ${health.grade})**`,
    ``,
    `| Dimension | Weight | Score | Summary |`,
    `| --- | ---: | ---: | --- |`,
    ...health.dimensions.map(
      (d) => `| ${d.name} | ${Math.round(d.weight * 100)}% | ${d.score}/100 | ${d.detail} |`
    ),
    ``,
    ...(health.heatmap.length > 0
      ? [
          `### Directory Health Heatmap`,
          `| Directory | Files | Avg Risk | Debt Findings | Test Map | Git Churn |`,
          `| --- | ---: | ---: | ---: | ---: | ---: |`,
          ...health.heatmap.slice(0, 10).map(
            (row) =>
              `| \`${row.directory}\` | ${row.files} | ${row.avgRisk}/100 | ${row.debtItems} | ${row.testCoveragePct}% | ${row.churn} |`
          ),
          ``,
        ]
      : []),
    ...(health.prioritizedActions.length > 0
      ? [
          `### Prioritized Stakeholder Actions`,
          ...health.prioritizedActions.map(
            (a) => `- **[${a.priority.toUpperCase()}]** \`${a.target}\` — ${a.title} (${a.rationale})`
          ),
          ``,
        ]
      : []),
    `## 3. Identified Risks & Security Findings`,
    `- **Scoring Model:** ${risk.formulaDescription}`,
    `- **Mean File Risk:** ${risk.averageScore}/100`,
    `- **Severity Distribution:** Critical (${risk.distribution.critical}) · High (${risk.distribution.high}) · Medium (${risk.distribution.medium}) · Low (${risk.distribution.low})`,
    ``,
    `| Rank | File | Risk Score | Category | Complexity Rank | Churn Rank | Primary Drivers |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...risk.files.slice(0, 12).map(
      (f) =>
        `| ${f.integratedRank} | \`${f.path}\` | ${f.score}/100 | ${f.category} | #${f.complexityRank} | ${
          f.churnRank ? `#${f.churnRank}` : 'N/A'
        } | ${f.explanation} |`
    ),
    ``,
    `### Security & Technical Debt Indicators`,
    `- **Total Findings:** ${debt.totalFindings} (${debt.verifiedCount} verified rules, ${debt.heuristicCount} heuristic indicators)`,
    `- **By Severity:** High (${debt.bySeverity.high}) · Medium (${debt.bySeverity.medium}) · Low (${debt.bySeverity.low})`,
    ...(debt.items.length > 0
      ? debt.items
          .slice(0, 15)
          .map((d) => `- **[${d.severity.toUpperCase()} · ${d.origin}]** \`${d.path}:${d.line}\` — ${d.title}: ${d.explanation}`)
      : [`- No significant security or technical debt items flagged.`]),
    ``,
    `## 4. Architecture Overview & Test Readiness`,
    `- **Modules (Nodes):** ${workspace.graph.nodes.length}`,
    `- **Internal Dependency Edges:** ${workspace.graph.edges.length} (Avg Coupling Density: ${avgDeg} edges/module)`,
    `- **Circular Dependencies Detected:** ${workspace.graph.cycles.length}`,
    `- **Entry Points:** ${workspace.graph.facts.entryPoints.slice(0, 8).map((p) => `\`${p}\``).join(', ') || 'None detected'}`,
    `- **Top External Dependencies:** ${workspace.graph.facts.topExternal.slice(0, 8).map((e) => `\`${e.name}\` (${e.count})`).join(', ') || 'None'}`,
    ``,
    ...(workspace.graph.facts.hubs.length > 0
      ? [
          `### Architectural Hubs (Highest Connectivity)`,
          `| Module | Language | Fan-In | Fan-Out | Max Complexity | Lines |`,
          `| --- | --- | ---: | ---: | ---: | ---: |`,
          ...workspace.graph.facts.hubs
            .slice(0, 8)
            .map((h) => `| \`${h.path}\` | ${h.language} | ${h.fanIn} | ${h.fanOut} | ${h.maxComplexity} | ${h.lines} |`),
          ``,
        ]
      : []),
    ...(workspace.graph.cycles.length > 0
      ? [
          `### Circular Dependency Cycles`,
          ...workspace.graph.cycles.slice(0, 8).map((c) => `- ${c.path.map((p) => `\`${p}\``).join(' -> ')}`),
          ``,
        ]
      : []),
    `### Test Impact & Coverage Readiness`,
    `- **Discovered Test Suites:** ${testImpact.testFiles.length} (${testImpact.totalCases} test cases; frameworks: ${testImpact.frameworks.join(', ') || 'none'})`,
    `- **Static Module Mapping Ratio:** ${testImpact.coverageRatioPct}%`,
    `- **Untested Modules:** ${testImpact.untestedModules.slice(0, 12).map((u) => `\`${u.path}\``).join(', ') || 'None'}`,
    ``,
    `## 5. Verification & Benchmark Telemetry`,
    `- **Git CLI Parity:** ${evalData.experiment1GitAccuracy.available ? `${evalData.experiment1GitAccuracy.commitMatchPct}% (${evalData.experiment1GitAccuracy.parsedCommitCount}/${evalData.experiment1GitAccuracy.cliCommitCount} commits)` : evalData.experiment1GitAccuracy.note}`,
    `- **Change Impact Expansion:** Avg ${evalData.experiment2ImpactAnalysis.avgDirectImpacted} direct + ${evalData.experiment2ImpactAnalysis.avgTransitiveImpacted} transitive dependents (${evalData.experiment2ImpactAnalysis.avgProcessingMs} ms avg traversal)`,
    `- **Risk Baseline Correlation:** Spearman ρ vs Complexity-only = ${evalData.experiment3RiskPrioritisation.spearmanVsComplexity}${evalData.experiment3RiskPrioritisation.spearmanVsChurn !== null ? `, vs Churn-only = ${evalData.experiment3RiskPrioritisation.spearmanVsChurn}` : ''}`,
    `- **Targeted Test Reduction:** Avg ${evalData.experiment4TestImpact.avgReductionPct}% suite reduction across top modules`,
    `- **Indexer Performance:** Scan+AST ${evalData.experiment5Performance.scanAndAstMs} ms · Git Extraction ${evalData.experiment5Performance.gitExtractionMs} ms · Heap ${evalData.experiment5Performance.heapUsedMb} MB`,
  ];

  return lines.join('\n');
}

export async function buildStakeholderSummary(workspace: RepoWorkspace) {
  const generatedAt = new Date().toISOString();
  const debt = computeTechnicalDebt(workspace);
  const risk = computeRiskIntelligence(workspace, debt);
  const testImpact = computeTestImpact(workspace, null, risk);
  const health = computeProjectHealth(workspace);
  const evaluation = await runResearchEvaluation(workspace);
  const markdown = await buildMarkdownReport(workspace);

  return {
    generatedAt,
    meta: workspace.meta,
    health,
    risk,
    debt,
    graph: workspace.graph,
    testImpact,
    evaluation,
    markdown,
  };
}

export function buildRiskCsvReport(workspace: RepoWorkspace): string {
  const risk = computeRiskIntelligence(workspace);
  const header = 'rank,file,language,score,category,complexity_rank,churn_rank,explanation';
  const rows = risk.files.map((f) => {
    const safeExp = `"${f.explanation.replace(/"/g, '""')}"`;
    return `${f.integratedRank},"${f.path}",${f.language},${f.score},${f.category},${f.complexityRank},${f.churnRank ?? ''},${safeExp}`;
  });
  return [header, ...rows].join('\n');
}

