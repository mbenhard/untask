# untask-batch — parallel task processing

Use this skill when you want to process multiple tasks or the user asks for batch work.

## Flow

1. **Scan:** Run `untask list --status todo --json` to get actionable tasks.
2. **Analyze:** Identify which tasks are independent (touch different files/areas).
3. **Propose:** Present the batch to the human for confirmation:
   ```
   I can work on these N tasks in parallel — they're independent:
   - #12 Add logout button (frontend, components/)
   - #15 Fix date parsing (backend, utils/)
   Proceed?
   ```
4. **Execute:** After human confirms, dispatch work:
   - Use subagents when your environment supports them (e.g. Claude Code Agent tool).
   - Fall back to sequential processing when subagents aren't available.
   - Each task follows `untask-finish` conventions (summary, confidence, etc.).
5. **Report:** After all tasks complete, summarize results:
   ```
   Completed N tasks:
   - #12 Add logout button — confidence: high
   - #15 Fix date parsing — confidence: medium
   All moved to review.
   ```

## Independence heuristics

Tasks are likely independent when:
- They reference different files, directories, or areas of the codebase
- They have different tags suggesting different domains
- Their descriptions don't mention shared state or dependencies

Do NOT parallelize when:
- Tasks reference the same files
- One task's output is another task's input
- They modify shared configuration or schema

## Config

Read `.untask/config.yml` for:
- `agent.max_parallel` — max concurrent subagents (default: 3)
- `agent.auto_done` — whether to mark tasks `done` or `review` when complete
