import { jsPDF } from 'jspdf';
import type { ExportReportSections, StakeholderExportPayload } from '../types';

export const DEFAULT_EXPORT_SECTIONS: ExportReportSections = {
  health: true,
  risks: true,
  architecture: true,
  benchmarks: true,
};

function pdfSafe(text: string): string {
  return String(text || '')
    .replace(/ρ/g, 'rho')
    .replace(/→/g, '->')
    .replace(/·/g, '|')
    .replace(/—/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

export function buildFilteredMarkdown(
  payload: StakeholderExportPayload,
  sections: ExportReportSections = DEFAULT_EXPORT_SECTIONS
): string {
  const { meta, health, risk, debt, graph, testImpact, evaluation, generatedAt } = payload;
  const avgDeg = graph.nodes.length > 0 ? (graph.edges.length / graph.nodes.length).toFixed(2) : '0.00';
  const topLanguages = meta.languages
    .slice(0, 5)
    .map((l) => `${l.language} (${l.percentage}%)`)
    .join(', ');

  const lines: string[] = [
    `# RepoMind Evolution — Stakeholder Intelligence Summary`,
    ``,
    `**Repository:** \`${meta.name}\`  `,
    `**Generated:** ${new Date(generatedAt).toUTCString()}  `,
    `**Source:** ${meta.source} (\`${meta.sourceRef}\`)`,
    ``,
    `---`,
    ``,
    `## Executive Workspace Overview`,
    `- **Scale:** ${meta.totalFiles} files · ${meta.totalLines.toLocaleString()} LOC · ${meta.totalSymbols} parsed symbols`,
    `- **Languages:** ${topLanguages || 'Unknown'}`,
    `- **Frameworks / Tooling:** ${meta.frameworks.join(', ') || 'None detected'}`,
    `- **Git History:** ${meta.hasGitHistory ? `${meta.commitCount} commits indexed` : 'ZIP snapshot (Git history unavailable)'}`,
    ``,
  ];

  if (sections.health) {
    lines.push(
      `## Project Health Status`,
      `- **Composite Score:** **${health.overallScore}/100 (Grade ${health.grade})**`,
      ``,
      `| Dimension | Weight | Score | Summary |`,
      `| --- | ---: | ---: | --- |`,
      ...health.dimensions.map(
        (d) => `| ${d.name} | ${Math.round(d.weight * 100)}% | ${d.score}/100 | ${d.detail} |`
      ),
      ``
    );

    if (health.heatmap.length > 0) {
      lines.push(
        `### Directory Health Heatmap`,
        `| Directory | Files | Avg Risk | Debt Findings | Test Map | Git Churn |`,
        `| --- | ---: | ---: | ---: | ---: | ---: |`,
        ...health.heatmap
          .slice(0, 10)
          .map(
            (row) =>
              `| \`${row.directory}\` | ${row.files} | ${row.avgRisk}/100 | ${row.debtItems} | ${row.testCoveragePct}% | ${row.churn} |`
          ),
        ``
      );
    }

    if (health.prioritizedActions.length > 0) {
      lines.push(
        `### Prioritized Stakeholder Actions`,
        ...health.prioritizedActions.map(
          (a) => `- **[${a.priority.toUpperCase()}]** \`${a.target}\` — ${a.title} (${a.rationale})`
        ),
        ``
      );
    }
  }

  if (sections.risks) {
    lines.push(
      `## Identified Risks & Security Findings`,
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
      ``
    );
  }

  if (sections.architecture) {
    lines.push(
      `## Architecture Overview & Test Readiness`,
      `- **Modules (Nodes):** ${graph.nodes.length}`,
      `- **Internal Dependency Edges:** ${graph.edges.length} (Avg Coupling Density: ${avgDeg} edges/module)`,
      `- **Circular Dependencies Detected:** ${graph.cycles.length}`,
      `- **Entry Points:** ${graph.facts.entryPoints.slice(0, 8).map((p) => `\`${p}\``).join(', ') || 'None detected'}`,
      `- **Top External Dependencies:** ${graph.facts.topExternal.slice(0, 8).map((e) => `\`${e.name}\` (${e.count})`).join(', ') || 'None'}`,
      ``
    );

    if (graph.facts.hubs.length > 0) {
      lines.push(
        `### Architectural Hubs (Highest Connectivity)`,
        `| Module | Language | Fan-In | Fan-Out | Max Complexity | Lines |`,
        `| --- | --- | ---: | ---: | ---: | ---: |`,
        ...graph.facts.hubs
          .slice(0, 8)
          .map((h) => `| \`${h.path}\` | ${h.language} | ${h.fanIn} | ${h.fanOut} | ${h.maxComplexity} | ${h.lines} |`),
        ``
      );
    }

    if (graph.cycles.length > 0) {
      lines.push(
        `### Circular Dependency Cycles`,
        ...graph.cycles.slice(0, 8).map((c) => `- ${c.path.map((p) => `\`${p}\``).join(' -> ')}`),
        ``
      );
    }

    lines.push(
      `### Test Impact & Coverage Readiness`,
      `- **Discovered Test Suites:** ${testImpact.testFiles.length} (${testImpact.totalCases} test cases; frameworks: ${testImpact.frameworks.join(', ') || 'none'})`,
      `- **Static Module Mapping Ratio:** ${testImpact.coverageRatioPct}%`,
      `- **Untested Modules:** ${testImpact.untestedModules.slice(0, 12).map((u) => `\`${u.path}\``).join(', ') || 'None'}`,
      ``
    );
  }

  if (sections.benchmarks) {
    lines.push(
      `## Verification & Benchmark Telemetry`,
      `- **Git CLI Parity:** ${evaluation.experiment1GitAccuracy.available ? `${evaluation.experiment1GitAccuracy.commitMatchPct}% (${evaluation.experiment1GitAccuracy.parsedCommitCount}/${evaluation.experiment1GitAccuracy.cliCommitCount} commits)` : evaluation.experiment1GitAccuracy.note}`,
      `- **Change Impact Expansion:** Avg ${evaluation.experiment2ImpactAnalysis.avgDirectImpacted} direct + ${evaluation.experiment2ImpactAnalysis.avgTransitiveImpacted} transitive dependents (${evaluation.experiment2ImpactAnalysis.avgProcessingMs} ms avg traversal)`,
      `- **Risk Baseline Correlation:** Spearman ρ vs Complexity-only = ${evaluation.experiment3RiskPrioritisation.spearmanVsComplexity}${evaluation.experiment3RiskPrioritisation.spearmanVsChurn !== null ? `, vs Churn-only = ${evaluation.experiment3RiskPrioritisation.spearmanVsChurn}` : ''}`,
      `- **Targeted Test Reduction:** Avg ${evaluation.experiment4TestImpact.avgReductionPct}% suite reduction across top modules`,
      `- **Indexer Performance:** Scan+AST ${evaluation.experiment5Performance.scanAndAstMs} ms · Git Extraction ${evaluation.experiment5Performance.gitExtractionMs} ms · Heap ${evaluation.experiment5Performance.heapUsedMb} MB`,
      ``
    );
  }

  return lines.join('\n');
}

export function downloadMarkdownFile(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportStakeholderPdf(
  payload: StakeholderExportPayload,
  sections: ExportReportSections = DEFAULT_EXPORT_SECTIONS
) {
  const { meta, health, risk, debt, graph, testImpact, evaluation, generatedAt } = payload;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = margin + 8;
    }
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(34);
    y += 6;
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, y, 4, 15, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(title), margin + 10, y + 12);
    y += 24;
  };

  const drawSubHeading = (title: string) => {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe(title), margin, y + 10);
    y += 18;
  };

  const drawWrappedText = (text: string, fontSize = 9.5, color: [number, number, number] = [51, 65, 85], indent = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(pdfSafe(text), contentWidth - indent) as string[];
    const lineHeight = fontSize * 1.42;
    for (const line of wrapped) {
      ensureSpace(lineHeight + 4);
      doc.text(line, margin + indent, y + fontSize);
      y += lineHeight;
    }
    y += 3;
  };

  // Executive Banner Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 108, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 104, pageWidth, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(147, 197, 253);
  doc.text('REPOMIND EVOLUTION | STAKEHOLDER INTELLIGENCE SUMMARY', margin, 32);

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(pdfSafe(meta.name), contentWidth - 110) as string[];
  doc.text(titleLines[0] || meta.name, margin, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  const sourceLine = `Source: ${meta.source.toUpperCase()} (${meta.sourceRef})   |   Generated: ${new Date(generatedAt).toUTCString()}`;
  doc.text(pdfSafe(sourceLine).slice(0, 96), margin, 82);

  // Health Grade Pill in Header
  const gradeColor: [number, number, number] =
    health.grade === 'A'
      ? [16, 185, 129]
      : health.grade === 'B'
      ? [59, 130, 246]
      : health.grade === 'C'
      ? [245, 158, 11]
      : [239, 68, 68];
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - margin - 86, 26, 86, 60, 6, 6, 'F');
  doc.setDrawColor(gradeColor[0], gradeColor[1], gradeColor[2]);
  doc.setLineWidth(1.5);
  doc.roundedRect(pageWidth - margin - 86, 26, 86, 60, 6, 6, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('HEALTH GRADE', pageWidth - margin - 43, 42, { align: 'center' });
  doc.setFontSize(22);
  doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2]);
  doc.text(health.grade, pageWidth - margin - 43, 66, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`${health.overallScore}/100`, pageWidth - margin - 43, 80, { align: 'center' });

  y = 128;

  // Executive KPI Strip
  const avgDeg = graph.nodes.length > 0 ? (graph.edges.length / graph.nodes.length).toFixed(2) : '0.00';
  const criticalHighCount = risk.distribution.critical + risk.distribution.high;
  const kpis = [
    { label: 'CODEBASE SCALE', value: `${meta.totalFiles} files`, sub: `${meta.totalLines.toLocaleString()} LOC | ${meta.totalSymbols} symbols` },
    { label: 'HEALTH SCORE', value: `${health.overallScore}/100`, sub: `Grade ${health.grade} | ${testImpact.coverageRatioPct}% test map` },
    { label: 'ELEVATED RISKS', value: `${criticalHighCount} files`, sub: `${risk.distribution.critical} critical | ${debt.verifiedCount} verified rules` },
    { label: 'ARCHITECTURE', value: `${graph.edges.length} edges`, sub: `${avgDeg} deg/mod | ${graph.cycles.length} cycles` },
  ];
  const cardGap = 10;
  const cardW = (contentWidth - cardGap * 3) / 4;
  kpis.forEach((k, i) => {
    const x = margin + i * (cardW + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, cardW, 56, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(k.label), x + 9, y + 15);

    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(k.value), x + 9, y + 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(pdfSafe(k.sub).slice(0, 28), x + 9, y + 48);
  });
  y += 72;

  const topLanguages = meta.languages
    .slice(0, 6)
    .map((l) => `${l.language} (${l.percentage}%)`)
    .join(', ');
  drawWrappedText(
    `Languages: ${topLanguages || 'Unknown'}   |   Frameworks: ${meta.frameworks.join(', ') || 'None detected'}   |   History: ${
      meta.hasGitHistory ? `${meta.commitCount} Git commits` : 'ZIP snapshot (no .git history)'
    }`,
    9,
    [71, 85, 105]
  );

  // SECTION 1: PROJECT HEALTH STATUS
  if (sections.health) {
    drawSectionHeading('Project Health Status');

    for (const dim of health.dimensions) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(`${dim.name} (${Math.round(dim.weight * 100)}% weight)`), margin, y + 10);

      doc.text(`${dim.score}/100`, pageWidth - margin, y + 10, { align: 'right' });

      // Progress Bar
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(margin, y + 15, contentWidth, 6, 2, 2, 'F');
      const barColor: [number, number, number] =
        dim.score >= 75 ? [16, 185, 129] : dim.score >= 50 ? [245, 158, 11] : [220, 38, 38];
      doc.setFillColor(barColor[0], barColor[1], barColor[2]);
      doc.roundedRect(margin, y + 15, Math.max(6, (contentWidth * dim.score) / 100), 6, 2, 2, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafe(dim.detail), margin, y + 31);
      y += 38;
    }

    if (health.heatmap.length > 0) {
      drawSubHeading('Directory Health Heatmap');
      ensureSpace(22);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentWidth, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('DIRECTORY', margin + 6, y + 12);
      doc.text('FILES', margin + 235, y + 12, { align: 'right' });
      doc.text('AVG RISK', margin + 305, y + 12, { align: 'right' });
      doc.text('DEBT', margin + 365, y + 12, { align: 'right' });
      doc.text('TEST MAP', margin + 435, y + 12, { align: 'right' });
      doc.text('CHURN', pageWidth - margin - 6, y + 12, { align: 'right' });
      y += 20;

      for (const row of health.heatmap.slice(0, 8)) {
        ensureSpace(18);
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(row.directory).slice(0, 36), margin + 6, y + 11);
        doc.setFont('helvetica', 'normal');
        doc.text(String(row.files), margin + 235, y + 11, { align: 'right' });
        doc.text(`${row.avgRisk}/100`, margin + 305, y + 11, { align: 'right' });
        doc.text(String(row.debtItems), margin + 365, y + 11, { align: 'right' });
        doc.text(`${row.testCoveragePct}%`, margin + 435, y + 11, { align: 'right' });
        doc.text(String(row.churn), pageWidth - margin - 6, y + 11, { align: 'right' });
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 16, pageWidth - margin, y + 16);
        y += 17;
      }
      y += 8;
    }

    if (health.prioritizedActions.length > 0) {
      drawSubHeading('Prioritized Stakeholder Actions');
      for (const act of health.prioritizedActions.slice(0, 6)) {
        drawWrappedText(`[${act.priority.toUpperCase()}] ${act.title} (${act.target}) - ${act.rationale}`, 8.8, [51, 65, 85], 8);
      }
    }
  }

  // SECTION 2: IDENTIFIED RISKS & SECURITY FINDINGS
  if (sections.risks) {
    drawSectionHeading('Identified Risks & Security Findings');
    drawWrappedText(
      `Model: ${risk.formulaDescription}. Mean module risk score is ${risk.averageScore}/100 across ${risk.files.length} source files (Critical: ${risk.distribution.critical}, High: ${risk.distribution.high}, Medium: ${risk.distribution.medium}, Low: ${risk.distribution.low}).`,
      9,
      [71, 85, 105]
    );

    drawSubHeading('Highest-Risk Source Modules');
    ensureSpace(22);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('#', margin + 6, y + 12);
    doc.text('FILE', margin + 26, y + 12);
    doc.text('SCORE', margin + 255, y + 12, { align: 'right' });
    doc.text('LEVEL', margin + 315, y + 12);
    doc.text('PRIMARY DRIVERS', margin + 370, y + 12);
    y += 20;

    for (const f of risk.files.slice(0, 10)) {
      ensureSpace(20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(String(f.integratedRank), margin + 6, y + 11);

      doc.setFont('courier', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(f.path).slice(0, 34), margin + 26, y + 11);

      doc.setFont('helvetica', 'bold');
      doc.text(`${f.score}/100`, margin + 255, y + 11, { align: 'right' });

      const catColor: [number, number, number] =
        f.category === 'critical'
          ? [185, 28, 28]
          : f.category === 'high'
          ? [194, 65, 12]
          : f.category === 'medium'
          ? [180, 83, 9]
          : [21, 128, 61];
      doc.setTextColor(catColor[0], catColor[1], catColor[2]);
      doc.text(f.category.toUpperCase(), margin + 315, y + 11);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(f.explanation.replace(/^Primary drivers:\s*/i, '')).slice(0, 34), margin + 370, y + 11);

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 16, pageWidth - margin, y + 16);
      y += 17;
    }

    y += 8;
    drawSubHeading(`Security & Technical Debt Indicators (${debt.totalFindings} total: ${debt.verifiedCount} verified, ${debt.heuristicCount} heuristic)`);
    if (debt.items.length === 0) {
      drawWrappedText('No verified security rules or structural debt hotspots flagged.', 9, [71, 85, 105], 8);
    } else {
      for (const item of debt.items.slice(0, 10)) {
        drawWrappedText(
          `[${item.severity.toUpperCase()} | ${item.origin}] ${item.path}:${item.line} - ${item.title}: ${item.explanation}`,
          8.5,
          [51, 65, 85],
          8
        );
      }
    }
  }

  // SECTION 3: ARCHITECTURE OVERVIEW
  if (sections.architecture) {
    drawSectionHeading('Architecture Overview & Test Readiness');
    drawWrappedText(
      `Dependency Graph: ${graph.nodes.length} indexed modules linked by ${graph.edges.length} internal import edges (average coupling density ${avgDeg} edges/module). Circular dependency cycles detected: ${graph.cycles.length}.`,
      9,
      [51, 65, 85]
    );
    drawWrappedText(
      `Entry Points: ${graph.facts.entryPoints.slice(0, 6).join(', ') || 'None detected'}   |   Top External Dependencies: ${
        graph.facts.topExternal.slice(0, 6).map((e) => `${e.name} (${e.count})`).join(', ') || 'None'
      }`,
      8.8,
      [71, 85, 105]
    );

    if (graph.facts.hubs.length > 0) {
      drawSubHeading('Architectural Hubs (Highest Fan-In / Fan-Out)');
      ensureSpace(22);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentWidth, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('MODULE', margin + 6, y + 12);
      doc.text('LANGUAGE', margin + 250, y + 12);
      doc.text('FAN-IN', margin + 350, y + 12, { align: 'right' });
      doc.text('FAN-OUT', margin + 410, y + 12, { align: 'right' });
      doc.text('MAX CC', pageWidth - margin - 6, y + 12, { align: 'right' });
      y += 20;

      for (const hub of graph.facts.hubs.slice(0, 8)) {
        ensureSpace(18);
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(hub.path).slice(0, 38), margin + 6, y + 11);
        doc.setFont('helvetica', 'normal');
        doc.text(pdfSafe(hub.language), margin + 250, y + 11);
        doc.text(String(hub.fanIn), margin + 350, y + 11, { align: 'right' });
        doc.text(String(hub.fanOut), margin + 410, y + 11, { align: 'right' });
        doc.text(String(hub.maxComplexity), pageWidth - margin - 6, y + 11, { align: 'right' });
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 16, pageWidth - margin, y + 16);
        y += 17;
      }
      y += 8;
    }

    if (graph.cycles.length > 0) {
      drawSubHeading('Detected Circular Dependency Cycles');
      for (const cyc of graph.cycles.slice(0, 6)) {
        drawWrappedText(`Cycle: ${cyc.path.join(' -> ')}`, 8.5, [185, 28, 28], 8);
      }
    }

    drawSubHeading('Test Mapping & Verification Readiness');
    drawWrappedText(
      `Discovered ${testImpact.testFiles.length} test suite(s) containing ${testImpact.totalCases} test case(s) (${
        testImpact.frameworks.join(', ') || 'static match'
      }). Static module mapping coverage: ${testImpact.coverageRatioPct}%.${
        testImpact.untestedModules.length > 0
          ? ` Untested modules (${testImpact.untestedModules.length}): ${testImpact.untestedModules
              .slice(0, 8)
              .map((u) => u.path)
              .join(', ')}.`
          : ' All code modules are statically linked to tests.'
      }`,
      8.8,
      [51, 65, 85]
    );
  }

  // SECTION 4: BENCHMARKS
  if (sections.benchmarks) {
    drawSectionHeading('Verification & Benchmark Telemetry');
    drawWrappedText(
      `Git CLI Parity: ${
        evaluation.experiment1GitAccuracy.available
          ? `${evaluation.experiment1GitAccuracy.commitMatchPct}% (${evaluation.experiment1GitAccuracy.parsedCommitCount}/${evaluation.experiment1GitAccuracy.cliCommitCount} commits)`
          : evaluation.experiment1GitAccuracy.note
      }`,
      8.8,
      [51, 65, 85],
      4
    );
    drawWrappedText(
      `Impact Traversal: Avg ${evaluation.experiment2ImpactAnalysis.avgDirectImpacted} direct + ${evaluation.experiment2ImpactAnalysis.avgTransitiveImpacted} transitive dependents in ${evaluation.experiment2ImpactAnalysis.avgProcessingMs} ms   |   Targeted Test Reduction: ${evaluation.experiment4TestImpact.avgReductionPct}%`,
      8.8,
      [51, 65, 85],
      4
    );
    drawWrappedText(
      `Risk Baseline Correlation: Spearman rho vs Complexity-only = ${evaluation.experiment3RiskPrioritisation.spearmanVsComplexity}${
        evaluation.experiment3RiskPrioritisation.spearmanVsChurn !== null
          ? `, vs Churn-only = ${evaluation.experiment3RiskPrioritisation.spearmanVsChurn}`
          : ''
      }   |   Runtime: Scan ${evaluation.experiment5Performance.scanAndAstMs} ms, Heap ${evaluation.experiment5Performance.heapUsedMb} MB`,
      8.8,
      [51, 65, 85],
      4
    );
  }

  // Page Footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(`RepoMind Evolution | Stakeholder Report | ${meta.name}`), margin, pageHeight - 19);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 19, { align: 'right' });
  }

  doc.save(`${meta.id}-stakeholder-summary.pdf`);
}
