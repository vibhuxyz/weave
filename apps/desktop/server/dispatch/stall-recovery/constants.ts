export const MAX_STALL_RECOVERIES = 2;

export const STALL_RESUME_PROMPT =
  "Weave sent this automatically; it is not a new instruction from the user. The engine stopped responding and was restarted, so your last action may not have been applied. Check the current state of the files, redo anything that did not complete, then finish the user's most recent request and do not start work they did not ask for. When it is fully done, reply with a short summary of what changed and anything still open.";
