import type { TaskDto } from "$lib/api";
import { formatBytes } from "$lib/format";

export const PROMPT_MODES = [
  { id: "implement", label: "Implement", desc: "build it now" },
  { id: "plan", label: "Plan", desc: "outline the approach" },
  { id: "explore", label: "Explore", desc: "discuss before acting" },
] as const;

export function buildTaskPrompt(
  task: TaskDto,
  mode: string = "implement",
  reviewNotes: string = "",
): string {
  const meta = [task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : ""]
    .filter(Boolean)
    .join(" | ");

  const attachmentManifest =
    task.attachments.length > 0
      ? `\n\nAttachments:\n${task.attachments
          .map(
            (attachment) =>
              `- ${attachment.filename} (${attachment.mime_type || "application/octet-stream"}, ${formatBytes(attachment.size)})`,
          )
          .join("\n")}\nAttached files exist and should be inspected separately if relevant.`
      : "";

  let prompt = "";
  if (mode === "revise") {
    prompt = `Revise task #${task.id}: ${task.title}\n\nThis task was reviewed and needs changes.`;
    if (reviewNotes) prompt += `\n\n## Review Notes\n${reviewNotes}`;
  } else if (mode === "implement") {
    prompt = `Implement task #${task.id}: ${task.title}`;
  } else if (mode === "plan") {
    prompt = `Create an implementation plan for task #${task.id}: ${task.title}\nDo not implement — outline the approach, key decisions, affected files, and risks.`;
  } else if (mode === "explore") {
    prompt = `Analyze task #${task.id}: ${task.title}\nExplore the problem space, surface questions, tradeoffs, and considerations before taking action.`;
  } else {
    prompt = `Implement task #${task.id}: ${task.title}`;
  }

  if (task.body.trim()) prompt += `\n\n${task.body.trim()}`;
  if (meta) prompt += `\n\n${meta}`;
  prompt += attachmentManifest;

  return prompt;
}
