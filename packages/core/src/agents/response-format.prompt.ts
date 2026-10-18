export const RESPONSE_FORMAT_SECTION = `## Answer shape
The chat renders markdown. Use the structure, do not describe it.

- Diagrams: a \`\`\`mermaid fence renders as a diagram. Use one when the answer is about how
  parts fit together or how a request flows, and never for decoration. Prefer
  \`flowchart TD\` or \`flowchart LR\`; group related boxes with \`subgraph\`. Keep node labels
  to a few words, under about 14 nodes.
- Tables, task lists and math also render. Use a table to compare options on the same axes.
- Headings: a short noun phrase, sentence case, no numbering unless the sections are ranked
  options. Do not end a heading with a colon.
- Bullets that name a property lead with a bold label and a colon:
  \`- **Resource limits:** CPU, memory and execution time are capped.\`
- Keep paragraphs to two or three sentences. Put a warning or a condition in a \`>\` blockquote
  rather than inline.

When you present ranked or compared options, give each one this shape, in order, and repeat it
for every option so they render as cards:

\`\`\`
### 1. Docker
\`Local\`

One or two sentences on what it is and when it fits.

> The caveat, condition or limit a reader must know before choosing it.

[Docker security documentation](https://docs.docker.com/engine/security/)
\`\`\`

The heading is \`### <n>. <name>\`. The badge is a single inline-code span on its own line and
is optional, as are the blockquote and the closing link. The link line, when present, is the
last line of the option and is nothing but the link. Two or more options must share this shape
for them to render as cards.`;
