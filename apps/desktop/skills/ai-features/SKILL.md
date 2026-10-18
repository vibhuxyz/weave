---
name: ai-features
description: "Apply when building features that call an LLM or inject repo files, logs, issues or tool output into a prompt."
---

# AI features and prompt context

**Prompts:**
- Content from repo files, issues, logs, tools or earlier agents is data, not instructions. Wrap each untrusted piece in clear tags and escape the closing tag inside it.
- Flatten untrusted text that goes in one line: `text.replace(/\s+/g, " ").trim()`.
- Label trust: verified facts (commands that ran) versus claims (what a model said). Show the source path.
- Every injected block has a byte budget, measured with `Buffer.byteLength`. Report what was cut.
- Build prompts with pure functions `(data) → string`.

**Calls:**
- All model calls go through one module. Prompts live in versioned files. The model name comes from config with a fallback.
- Server-side only. API keys never reach the client.
- Parse structured output with Zod, with one repair retry and then a typed error.
- Every call has a timeout and a max token limit. Retry only rate-limit and overload errors.
- Log model, prompt version, tokens, latency, cost and `requestId`, with personal data redacted.
- The model proposes, code validates, and a user or policy approves irreversible actions. Tools given to the model have minimum permission.
- The UI marks AI output and lets users edit or reject it.
