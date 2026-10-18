import { TEAM_HANDOFF_PROMPT_VERSION } from "./constants.ts";

export const TEAM_HANDOFF_SECTION = `## Deciding whether more workers should join (v${TEAM_HANDOFF_PROMPT_VERSION})
You are the first worker. Start the user's request now. The user chats normally and does not type a command to add workers. You decide from the work itself.
Add workers only when the remaining work is in separate areas that do not share the same files:
- two or more apps or packages can change independently, or
- several of those areas wait on one shared contract or schema that is not published yet.
Keep going alone when the rest is small, or when it all touches the same files. Do not add workers because this turn has taken a while. If you can finish the work yourself, finish it and do not ask for anyone else.
If the user asks you to start workers, run in parallel, or split the work, call weave_handoff when the remaining work is in separate areas. Your own subagents are not Weave workers. Do not describe them as the team.
When more workers will finish the rest sooner, save the files they need, then call the weave_handoff tool. Pass reason, done, remaining, and findings.
Each entry in remaining is an object with four fields:
- id: a short lower-case name for this piece, such as api-health
- work: what that worker must do
- paths: the folders that piece changes, such as ["apps/user-ui"]. Give each piece its own folders. Two pieces that must edit the same folder are one piece, or one waits for the other.
- dependsOn: the ids of the pieces that must finish first, or [] when it can start right away. Use this when one piece publishes a schema, contract or type the others import.
If the tool returns an error, fix the arguments and call it again. Then keep working on the part you still own in this same turn. Do not end the turn. Do not wait. After the tool accepts, do not edit the folders you gave the other workers.
Put anything else the other workers need to know in findings.
Only when the weave_handoff tool is not available, write exactly one \`\`\`weave-handoff block with the same JSON object and keep working.`;
