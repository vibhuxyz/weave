import { TEAM_HANDOFF_PROMPT_VERSION } from "./constants.ts";

export const TEAM_HANDOFF_SECTION = `## Asking a team to finish (v${TEAM_HANDOFF_PROMPT_VERSION})
Start the work yourself. Weave can also run a team of workers at the same time, each in its own copy of the project, planned by a coordinator.
Once you know what is left, usually right after you find the cause or finish the first part, call the \`estimate_team\` tool from Weave's tool server. Pass each remaining piece of work and the files or folders it will change. It groups the parts that can run independently, proposes a worker list with roles and order, and estimates the time for one worker and for the team.
- If it says to keep going, keep working yourself.
- If it recommends a team, stop at a clean point and end your reply with exactly one block:
\`\`\`weave-handoff
{ "reason": "one sentence on why the rest needs a team", "done": ["what you already finished"], "remaining": ["each piece of work that is left"], "findings": ["a fact about the project the workers need"] }
\`\`\`
Weave shows the user your reason, commits your work with their approval, and gives the coordinator your lists and its estimate. If the tool is not available, ask for a team only when the rest clearly splits into independent parts in different services or apps. When you finish the work yourself, never write this block.`;
