export interface LangStat {
  language: string;
  files: number;
  lines: number;
  percentage: number;
}

export interface ManifestInfo {
  file: string;
  type: string;
  dependencies: { name: string; version: string; dev: boolean }[];
}

export interface RepoMeta {
  id: string;
  name: string;
  source: 'sample' | 'git' | 'zip';
  sourceRef: string;
  createdAt: string;
  status: 'ready' | 'error';
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  languages: LangStat[];
  frameworks: string[];
  manifests: ManifestInfo[];
  hasGitHistory: boolean;
  commitCount: number;
  analysisMs: number;
}

export interface HealthStatus {
  status: string;
  gitVersion: string;
  geminiConfigured: boolean;
  geminiModel: string;
  loadedRepos: number;
}

export interface TreeNode {
  name: string;
  type: 'dir' | 'file';
  path: string;
  language?: string;
  lines?: number;
  children?: TreeNode[];
}

export interface FileSummary {
  path: string;
  language: string;
  lines: number;
  symbols: number;
  maxComplexity: number;
  isTest: boolean;
  endpoints: number;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'method' | 'endpoint';
  line: number;
  endLine: number;
  lines: number;
  complexity: number;
  hasDoc: boolean;
  exported: boolean;
}

export interface FileRecord {
  path: string;
  name: string;
  dir: string;
  language: string;
  lines: number;
  codeLines: number;
  bytes: number;
  isTest: boolean;
  imports: string[];
  externalImports: string[];
  symbols: SymbolInfo[];
  endpoints: { method: string; route: string; line: number }[];
  maxComplexity: number;
  avgComplexity: number;
  content: string;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  files: { path: string; additions: number; deletions: number }[];
  additions: number;
  deletions: number;
}

export interface FileChurnStat {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  churn: number;
  lastModified: string;
  authors: string[];
}

export interface GitHistoryData {
  available: boolean;
  branch: string;
  remoteUrl: string | null;
  totalCommits: number;
  commits: GitCommit[];
  fileChurn: FileChurnStat[];
  timeline: { date: string; commits: number; additions: number; deletions: number }[];
  extractionMs: number;
  note?: string;
}

export interface ImpactedComponent {
  path: string;
  depth: number;
  impactType: 'direct' | 'transitive';
  impactPath: string[];
  severity: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  symbolsCount: number;
  endpoints: string[];
}

export interface ChangeImpactResult {
  targetFile: string;
  targetSymbol: string | null;
  commitSha: string | null;
  changedSymbols: SymbolInfo[];
  directDependents: ImpactedComponent[];
  transitiveDependents: ImpactedComponent[];
  affectedApis: { file: string; method: string; route: string; line: number; hop: number }[];
  associatedTests: { path: string; reason: string; priority: 'high' | 'medium' | 'low'; cases: number }[];
  directCount: number;
  transitiveCount: number;
  totalAffected: number;
  blastRadiusPct: number;
  processingMs: number;
  limitationsNote: string;
}

export interface RiskFactor {
  name: string;
  weight: number;
  rawValue: number | null;
  normalized: number;
  contribution: number;
  detail: string;
}

export interface FileRiskScore {
  path: string;
  language: string;
  score: number;
  category: 'critical' | 'high' | 'medium' | 'low';
  factors: RiskFactor[];
  explanation: string;
  complexityRank: number;
  churnRank: number | null;
  integratedRank: number;
  missingGitData: boolean;
}

export interface RiskSummaryResult {
  hasGitData: boolean;
  formulaDescription: string;
  assumptions: string[];
  distribution: { critical: number; high: number; medium: number; low: number };
  averageScore: number;
  files: FileRiskScore[];
  directoryHotspots: { directory: string; avgRisk: number; maxRisk: number; fileCount: number }[];
}

export interface DebtItem {
  id: string;
  origin: 'verified_rule' | 'heuristic_indicator';
  category: 'security' | 'complexity' | 'size' | 'duplication' | 'coupling' | 'documentation' | 'quality';
  severity: 'high' | 'medium' | 'low';
  path: string;
  line: number;
  title: string;
  explanation: string;
  suggestion: string;
  snippet: string;
  metricValue?: string;
}

export interface TechnicalDebtResult {
  totalFindings: number;
  verifiedCount: number;
  heuristicCount: number;
  bySeverity: { high: number; medium: number; low: number };
  byCategory: Record<string, number>;
  items: DebtItem[];
}

export interface TestImpactResult {
  frameworks: string[];
  testFiles: {
    path: string;
    language: string;
    caseCount: number;
    cases: { name: string; line: number }[];
    directTargets: string[];
  }[];
  totalCases: number;
  untestedModules: { path: string; functions: number; classes: number; lines: number; riskCategory: string }[];
  coverageRatioPct: number;
  selectedTarget: string | null;
  recommendations: {
    testPath: string;
    rank: number;
    score: number;
    matchType: 'direct_import' | 'transitive_dependency' | 'naming_convention';
    reason: string;
    caseCount: number;
    matchedSourceFiles: string[];
  }[];
  allTestsCount: number;
  recommendedTestsCount: number;
  reductionPct: number;
  note: string;
}

export interface ArchNode {
  id: string;
  path: string;
  language: string;
  lines: number;
  functions: number;
  classes: number;
  fanIn: number;
  fanOut: number;
  maxComplexity: number;
  isTest: boolean;
  externalImports: string[];
}

export interface DependencyGraph {
  nodes: ArchNode[];
  edges: { source: string; target: string; lines: number[] }[];
  cycles: { modules: string[]; path: string[] }[];
  facts: {
    facts: string[];
    hubs: ArchNode[];
    entryPoints: string[];
    isolated: string[];
    topExternal: { name: string; count: number }[];
  };
}

export interface ArchEvolutionResult {
  baseRef: string;
  headRef: string;
  baseStats: { nodes: number; edges: number; cycles: number; avgDegree: number };
  headStats: { nodes: number; edges: number; cycles: number; avgDegree: number };
  addedModules: string[];
  removedModules: string[];
  addedEdges: { source: string; target: string }[];
  removedEdges: { source: string; target: string }[];
  newCycles: string[][];
  resolvedCycles: string[][];
  couplingDelta: number;
  summary: string;
}

export interface AssistantCitation {
  path: string;
  line: number;
  snippet: string;
  source: 'code' | 'impact' | 'risk' | 'debt' | 'test' | 'git';
}

export interface AssistantResponse {
  answer: string;
  deterministicFacts: string[];
  citations: AssistantCitation[];
  model: string;
  specialistFocus: string;
}

export interface ContributorKnowledgeResult {
  available: boolean;
  disclaimer: string;
  contributors: {
    author: string;
    email: string;
    commits: number;
    sharePct: number;
    additions: number;
    deletions: number;
    filesTouched: number;
    topDirectories: { directory: string; commits: number }[];
    firstCommit: string;
    lastCommit: string;
  }[];
  fileConcentration: {
    path: string;
    totalCommits: number;
    topAuthor: string;
    topAuthorSharePct: number;
    authorCount: number;
    concentrationLevel: 'single_owner' | 'concentrated' | 'shared';
  }[];
  singleOwnerFilesCount: number;
  note?: string;
}

export interface ProjectHealthResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    name: string;
    score: number;
    weight: number;
    formula: string;
    detail: string;
  }[];
  heatmap: {
    directory: string;
    files: number;
    lines: number;
    avgRisk: number;
    debtItems: number;
    testCoveragePct: number;
    churn: number;
  }[];
  prioritizedActions: {
    priority: 'high' | 'medium' | 'low';
    title: string;
    target: string;
    rationale: string;
  }[];
}

export interface RepoComparisonResult {
  mode: 'git_refs' | 'repositories';
  leftLabel: string;
  rightLabel: string;
  metrics: { metric: string; leftValue: number | string; rightValue: number | string; delta: string }[];
  fileChanges: { path: string; status: 'added' | 'removed' | 'modified'; linesDelta: number }[];
  dependencyChanges: { addedEdges: number; removedEdges: number; cycleDelta: number };
  summary: string;
}

export interface ResearchEvaluationResult {
  researchQuestion: string;
  repositoryId: string;
  repositoryName: string;
  timestamp: string;
  experiment1GitAccuracy: {
    available: boolean;
    cliCommitCount: number;
    parsedCommitCount: number;
    commitMatchPct: number;
    cliFileOpsCount: number;
    parsedFileOpsCount: number;
    additionsCli: number;
    additionsParsed: number;
    deletionsCli: number;
    deletionsParsed: number;
    extractionMs: number;
    note: string;
  };
  experiment2ImpactAnalysis: {
    evaluatedFiles: number;
    avgDirectImpacted: number;
    avgTransitiveImpacted: number;
    transitiveExpansionFactor: number;
    avgProcessingMs: number;
    samples: { file: string; direct: number; transitive: number; testsMatched: number; ms: number }[];
  };
  experiment3RiskPrioritisation: {
    evaluatedFiles: number;
    spearmanVsComplexity: number;
    spearmanVsChurn: number | null;
    top5OverlapWithComplexity: number;
    top5OverlapWithChurn: number | null;
    topRiskFiles: {
      file: string;
      integratedScore: number;
      integratedRank: number;
      complexityRank: number;
      churnRank: number | null;
    }[];
  };
  experiment4TestImpact: {
    evaluatedFiles: number;
    totalTestFiles: number;
    avgRecommendedTests: number;
    avgReductionPct: number;
    filesWithZeroStaticTestMatch: number;
  };
  experiment5Performance: {
    totalFiles: number;
    totalLines: number;
    totalCommits: number;
    dependencyEdges: number;
    cyclesDetected: number;
    scanAndAstMs: number;
    gitExtractionMs: number;
    heapUsedMb: number;
  };
}

export type OpenFileFn = (path: string, line?: number) => void;

export interface BreadcrumbSegment {
  id: string;
  label: string;
  mono?: boolean;
  title?: string;
  onClick?: () => void;
}

export interface BreadcrumbContextUpdate {
  segments: BreadcrumbSegment[];
  activeFilePath?: string | null;
  onResetView?: () => void;
}

export interface ExportReportSections {
  health: boolean;
  risks: boolean;
  architecture: boolean;
  benchmarks: boolean;
}

export interface StakeholderExportPayload {
  generatedAt: string;
  meta: RepoMeta;
  health: ProjectHealthResult;
  risk: RiskSummaryResult;
  debt: TechnicalDebtResult;
  graph: DependencyGraph;
  testImpact: TestImpactResult;
  evaluation: ResearchEvaluationResult;
  markdown: string;
}

