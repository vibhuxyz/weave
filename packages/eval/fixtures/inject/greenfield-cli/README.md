# wordcount (spec)

A CLI that reads text from stdin and prints the top N most frequent words.

    node src/cli.js --top N

Output: JSON array on stdout, `[{ "word": "...", "count": N }, ...]`, ordered
most frequent first. Words are case-insensitive; any run of whitespace
separates them. Empty input prints `[]`.
