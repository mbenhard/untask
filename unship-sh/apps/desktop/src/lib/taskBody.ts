import { stripSubtasksFromBody } from "$lib/subtasks";

export type ParsedTaskBody = {
  description: string;
  agentSummary: string | null;
  deferred: string | null;
  reviewNotes: string | null;
};

const AGENT_HEADINGS = ["agent summary", "deferred", "review notes"];

export function parseTaskBodySections(body: string): ParsedTaskBody {
  const lines = body.split("\n");
  const sections: { heading: string; startLine: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.+)$/);
    if (!match) continue;

    const heading = match[1].trim().toLowerCase();
    if (AGENT_HEADINGS.includes(heading)) {
      sections.push({ heading, startLine: i });
    }
  }

  if (sections.length === 0) {
    return { description: body, agentSummary: null, deferred: null, reviewNotes: null };
  }

  const firstSectionLine = Math.min(...sections.map((section) => section.startLine));
  const description = lines.slice(0, firstSectionLine).join("\n").trimEnd();

  function extractSection(heading: string): string | null {
    const section = sections.find((candidate) => candidate.heading === heading);
    if (!section) return null;

    const nextSection = sections
      .filter((candidate) => candidate.startLine > section.startLine)
      .sort((left, right) => left.startLine - right.startLine)[0];
    const endLine = nextSection ? nextSection.startLine : lines.length;

    return lines
      .slice(section.startLine + 1, endLine)
      .join("\n")
      .trim();
  }

  return {
    description,
    agentSummary: extractSection("agent summary"),
    deferred: extractSection("deferred"),
    reviewNotes: extractSection("review notes"),
  };
}

export function hasEditableTaskNotes(body: string): boolean {
  const parsed = parseTaskBodySections(body);
  const description =
    parsed.agentSummary != null || parsed.deferred != null || parsed.reviewNotes != null
      ? parsed.description
      : body;
  return stripSubtasksFromBody(description).length > 0;
}

export function replaceOrAppendTaskSection(
  body: string,
  heading: string,
  content: string,
): string {
  const lines = body.split("\n");
  const headingLower = heading.toLowerCase();
  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.+)$/);
    if (!match) continue;

    const currentHeading = match[1].trim().toLowerCase();
    if (currentHeading === headingLower) {
      sectionStart = i;
    } else if (sectionStart >= 0 && sectionEnd === lines.length) {
      sectionEnd = i;
    }
  }

  const newSection = `## ${heading}\n${content}`;

  if (sectionStart >= 0) {
    const before = lines.slice(0, sectionStart).join("\n");
    const after = lines.slice(sectionEnd).join("\n");
    return [before, newSection, after].filter(Boolean).join("\n");
  }

  return `${body.trimEnd()}\n\n${newSection}\n`;
}

export function composeTaskBodyFromSections(parsed: ParsedTaskBody, description: string): string {
  const sections: string[] = [];
  const trimmedDescription = description.trimEnd();

  if (trimmedDescription) sections.push(trimmedDescription);
  if (parsed.agentSummary != null) sections.push(`## Agent Summary\n${parsed.agentSummary}`);
  if (parsed.deferred != null) sections.push(`## Deferred\n${parsed.deferred}`);
  if (parsed.reviewNotes != null) sections.push(`## Review Notes\n${parsed.reviewNotes}`);

  if (sections.length === 0) return "";
  return `${sections.join("\n\n")}\n`;
}
