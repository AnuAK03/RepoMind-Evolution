import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { RepoWorkspace } from './types.ts';
import {
  computeChangeImpact,
  computeProjectHealth,
  computeRiskIntelligence,
  computeTechnicalDebt,
  computeTestImpact,
} from './analysis.ts';

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

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets to enable the AI Software Engineering Assistant.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 25000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyFocus(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('impact') || q.includes('depend') || q.includes('affect') || q.includes('break')) {
    return 'Change Impact Specialist';
  }
  if (q.includes('risk') || q.includes('danger') || q.includes('hotspot') || q.includes('churn')) {
    return 'Software Risk Specialist';
  }
  if (q.includes('test') || q.includes('pytest') || q.includes('coverage') || q.includes('vitest')) {
    return 'Test Impact Specialist';
  }
  if (q.includes('debt') || q.includes('security') || q.includes('sql') || q.includes('complexity')) {
    return 'Technical Debt & Security Specialist';
  }
  if (q.includes('git') || q.includes('commit') || q.includes('history') || q.includes('author')) {
    return 'Git Evolution Specialist';
  }
  return 'Repository Architecture Synthesizer';
}

function retrieveEvidence(
  workspace: RepoWorkspace,
  question: string,
  focusFile?: string
): {
  deterministicFacts: string[];
  citations: AssistantCitation[];
  contextPrompt: string;
} {
  const debt = computeTechnicalDebt(workspace);
  const risk = computeRiskIntelligence(workspace, debt);
  const health = computeProjectHealth(workspace);
  const testImpact = computeTestImpact(workspace, focusFile || null, risk);

  const citations: AssistantCitation[] = [];
  const deterministicFacts: string[] = [
    `Repository: ${workspace.meta.name} (${workspace.meta.totalFiles} files, ${workspace.meta.totalLines} lines, ${workspace.meta.frameworks.join(', ') || 'no frameworks detected'})`,
    `Project Health Score: ${health.overallScore}/100 (Grade ${health.grade})`,
    `Dependency Graph: ${workspace.graph.nodes.length} code nodes, ${workspace.graph.edges.length} edges, ${workspace.graph.cycles.length} cycles`,
  ];

  // Resolve target file either from explicit focusFile or keyword match in question
  const qLower = question.toLowerCase();
  const matchedFiles = Object.values(workspace.files)
    .filter((f) => {
      if (focusFile && f.path === focusFile) return true;
      const base = f.name.toLowerCase();
      return qLower.includes(f.path.toLowerCase()) || qLower.includes(base.replace(/\.[^.]+$/, ''));
    })
    .slice(0, 3);

  const primaryFile = focusFile && workspace.files[focusFile]
    ? workspace.files[focusFile]
    : matchedFiles[0] || Object.values(workspace.files).find((f) => f.path === risk.files[0]?.path);

  if (primaryFile) {
    const impact = computeChangeImpact(workspace, primaryFile.path);
    deterministicFacts.push(
      `Impact for ${primaryFile.path}: ${impact.directCount} direct dependents, ${impact.transitiveCount} transitive dependents (${impact.blastRadiusPct}% blast radius), ${impact.associatedTests.length} mapped tests.`
    );

    const previewLines = primaryFile.content.split('\n').slice(0, 35);
    citations.push({
      path: primaryFile.path,
      line: 1,
      snippet: previewLines.join('\n').slice(0, 900),
      source: 'code',
    });

    for (const dep of impact.directDependents.slice(0, 3)) {
      citations.push({
        path: dep.path,
        line: 1,
        snippet: dep.reason,
        source: 'impact',
      });
    }
  }

  for (const rf of risk.files.slice(0, 5)) {
    deterministicFacts.push(
      `Risk #${rf.integratedRank}: ${rf.path} — ${rf.score}/100 (${rf.category}). ${rf.explanation}`
    );
    if (citations.length < 10) {
      citations.push({
        path: rf.path,
        line: 1,
        snippet: `Risk ${rf.score}/100 (${rf.category}) — ${rf.explanation}`,
        source: 'risk',
      });
    }
  }

  for (const d of debt.items.slice(0, 5)) {
    deterministicFacts.push(`[${d.origin}] ${d.path}:${d.line} — ${d.title} (${d.severity})`);
    citations.push({
      path: d.path,
      line: d.line,
      snippet: d.snippet || d.explanation,
      source: 'debt',
    });
  }

  if (workspace.git.available) {
    for (const c of workspace.git.commits.slice(0, 5)) {
      deterministicFacts.push(
        `Commit ${c.shortSha} by ${c.author} (${c.date.slice(0, 10)}): ${c.subject} [+${c.additions}/-${c.deletions}]`
      );
      if (c.files[0]) {
        citations.push({
          path: c.files[0].path,
          line: 1,
          snippet: `Commit ${c.shortSha}: ${c.subject}`,
          source: 'git',
        });
      }
    }
  }

  if (testImpact.recommendations.length > 0) {
    deterministicFacts.push(
      `Recommended tests for ${testImpact.selectedTarget}: ${testImpact.recommendations
        .map((r) => `${r.testPath} (${r.matchType})`)
        .join(', ')}`
    );
  } else if (testImpact.untestedModules.length > 0) {
    deterministicFacts.push(
      `Untested modules (${testImpact.untestedModules.length}): ${testImpact.untestedModules
        .slice(0, 5)
        .map((u) => u.path)
        .join(', ')}`
    );
  }

  const contextPrompt = [
    '=== DETERMINISTIC REPOSITORY EVIDENCE ===',
    ...deterministicFacts.map((f) => `- ${f}`),
    '',
    '=== RETRIEVED CODE & FINDING SNIPPETS ===',
    ...citations.slice(0, 8).map((c) => `[${c.source.toUpperCase()}] ${c.path}:${c.line}\n${c.snippet}`),
  ].join('\n');

  return { deterministicFacts, citations: citations.slice(0, 10), contextPrompt };
}

export async function askEngineeringAssistant(
  workspace: RepoWorkspace,
  question: string,
  focusFile?: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<AssistantResponse> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error('Question cannot be empty.');
  }

  const specialistFocus = classifyFocus(trimmed);
  const { deterministicFacts, citations, contextPrompt } = retrieveEvidence(workspace, trimmed, focusFile);
  const ai = getGeminiClient();

  const systemInstruction = [
    `You are the RepoMind Evolution ${specialistFocus}.`,
    'Answer the developer question strictly using the provided deterministic repository evidence and code snippets.',
    'Rules:',
    '1. Always distinguish Deterministic Facts (computed AST, Git, graph, risk, and static rule findings) from AI Engineering Interpretation.',
    '2. Cite exact file paths and line numbers (e.g., `tracker/authentication.py:15`) whenever referencing code or findings.',
    '3. Never invent files, functions, commit SHAs, or test execution results that are not present in the evidence.',
    '4. Be concise, technical, and structured with actionable engineering recommendations.',
  ].join('\n');

  const priorTranscript = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const contents = [
    contextPrompt,
    priorTranscript ? `\n=== CONVERSATION HISTORY ===\n${priorTranscript}` : '',
    `\n=== CURRENT DEVELOPER QUESTION ===\n${trimmed}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const answer = (response.text || '').trim();
  if (!answer) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    answer,
    deterministicFacts,
    citations,
    model: 'gemini-4-hydrogen',
    specialistFocus,
  };
}
