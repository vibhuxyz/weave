const MODE_QUERY = /\x1B\[\?(\d+)\$p/g;
const PRIMARY_DEVICE_ATTRIBUTES_QUERY = /\x1B\[0?c/;
const KEYBOARD_PROTOCOL_QUERY = "\x1B[?u";
const CURSOR_POSITION_QUERY = "\x1B[6n";
const FOREGROUND_COLOR_QUERY = "\x1B]10;?";
const BACKGROUND_COLOR_QUERY = "\x1B]11;?";

const PRIMARY_DEVICE_ATTRIBUTES_REPLY = "\x1B[?62;22c";
const KEYBOARD_PROTOCOL_REPLY = "\x1B[?0u";
const CURSOR_POSITION_REPLY = "\x1B[1;1R";
const FOREGROUND_COLOR_REPLY = "\x1B]10;rgb:ffff/ffff/ffff\x1B\\";
const BACKGROUND_COLOR_REPLY = "\x1B]11;rgb:0000/0000/0000\x1B\\";
const MODE_RESET_STATE = 2;

export function terminalQueryReplies(chunk: string): string[] {
  const replies = [...chunk.matchAll(MODE_QUERY)].map(
    (match) => `\x1B[?${match[1] ?? "0"};${MODE_RESET_STATE}$y`,
  );
  if (PRIMARY_DEVICE_ATTRIBUTES_QUERY.test(chunk)) replies.push(PRIMARY_DEVICE_ATTRIBUTES_REPLY);
  if (chunk.includes(KEYBOARD_PROTOCOL_QUERY)) replies.push(KEYBOARD_PROTOCOL_REPLY);
  if (chunk.includes(CURSOR_POSITION_QUERY)) replies.push(CURSOR_POSITION_REPLY);
  if (chunk.includes(FOREGROUND_COLOR_QUERY)) replies.push(FOREGROUND_COLOR_REPLY);
  if (chunk.includes(BACKGROUND_COLOR_QUERY)) replies.push(BACKGROUND_COLOR_REPLY);
  return replies;
}
