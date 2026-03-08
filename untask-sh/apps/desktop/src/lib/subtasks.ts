export type Subtask = {
  text: string;
  checked: boolean;
  lineIndex: number;
};

const CHECKLIST_PATTERN = /^- \[( |x|X)\](?:\s(.*))?$/;

function splitLines(body: string): string[] {
  return body.length === 0 ? [] : body.split("\n");
}

function isTopLevelChecklist(line: string): RegExpMatchArray | null {
  if (line.startsWith("  ") || line.startsWith("\t")) {
    return null;
  }

  return line.trimStart().match(CHECKLIST_PATTERN);
}

function formatSubtask(subtask: Pick<Subtask, "checked" | "text">): string {
  return `- [${subtask.checked ? "x" : " "}] ${subtask.text}`;
}

function formatSubtasks(subtasks: Subtask[]): string {
  return subtasks.map((subtask) => formatSubtask(subtask)).join("\n");
}

export function parseSubtasks(body: string): Subtask[] {
  const lines = splitLines(body);
  const subtasks: Subtask[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = isTopLevelChecklist(lines[i]);
    if (!match) {
      continue;
    }

    subtasks.push({
      text: match[2] ?? "",
      checked: match[1].toLowerCase() === "x",
      lineIndex: i,
    });
  }

  return subtasks;
}

export function stripSubtasksFromBody(body: string): string {
  const lines = splitLines(body);
  return lines.filter((line) => !isTopLevelChecklist(line)).join("\n").trim();
}

export function composeBodyWithNotesAndSubtasks(notesBody: string, subtaskSourceBody: string): string {
  const sections: string[] = [];
  const trimmedNotes = notesBody.trim();
  const subtasks = parseSubtasks(subtaskSourceBody);

  if (trimmedNotes) {
    sections.push(trimmedNotes);
  }

  if (subtasks.length > 0) {
    sections.push(formatSubtasks(subtasks));
  }

  return sections.join("\n\n");
}

export function addSubtaskToBody(body: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return body;
  }

  const newLine = formatSubtask({ checked: false, text: trimmed });
  if (body.length === 0) {
    return newLine;
  }

  const lines = splitLines(body);
  const subtasks = parseSubtasks(body);
  if (subtasks.length === 0) {
    if (lines.at(-1)?.trim() !== "") {
      lines.push("");
    }
    lines.push(newLine);
    return lines.join("\n");
  }

  const lastSubtask = subtasks[subtasks.length - 1];
  lines.splice(lastSubtask.lineIndex + 1, 0, newLine);
  return lines.join("\n");
}

export function toggleSubtaskInBody(body: string, index: number): string {
  const subtasks = parseSubtasks(body);
  const target = subtasks[index];
  if (!target) {
    return body;
  }

  const lines = splitLines(body);
  lines[target.lineIndex] = formatSubtask({
    checked: !target.checked,
    text: target.text,
  });
  return lines.join("\n");
}

export function updateSubtaskTextInBody(body: string, index: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return deleteSubtaskFromBody(body, index);
  }

  const subtasks = parseSubtasks(body);
  const target = subtasks[index];
  if (!target) {
    return body;
  }

  const lines = splitLines(body);
  lines[target.lineIndex] = formatSubtask({
    checked: target.checked,
    text: trimmed,
  });
  return lines.join("\n");
}

export function deleteSubtaskFromBody(body: string, index: number): string {
  const subtasks = parseSubtasks(body);
  const target = subtasks[index];
  if (!target) {
    return body;
  }

  const lines = splitLines(body);
  lines.splice(target.lineIndex, 1);
  return lines.join("\n");
}

export function reorderSubtasksInBody(body: string, fromIndex: number, toIndex: number): string {
  const subtasks = parseSubtasks(body);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= subtasks.length ||
    toIndex >= subtasks.length ||
    fromIndex === toIndex
  ) {
    return body;
  }

  const reordered = [...subtasks];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  const lines = splitLines(body);
  const subtaskSlots = subtasks.map((subtask) => subtask.lineIndex);
  reordered.forEach((subtask, slotIndex) => {
    lines[subtaskSlots[slotIndex]] = formatSubtask(subtask);
  });

  return lines.join("\n");
}
