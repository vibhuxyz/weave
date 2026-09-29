export const SHELL_TOKEN =
  /'(?<single>[^']*)'?|"(?<double>(?:\\[\s\S]|[^"\\])*)"?|\\(?<escaped>[\s\S]?)|(?<separator>[\s|&;<>()]+)|(?<bare>[^'"\\\s|&;<>()]+)/g;

export const DOUBLE_QUOTE_ESCAPE = /\\([$`"\\\n])/g;
