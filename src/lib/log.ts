// Minimal ANSI logger — no chalk dep.

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const noColor = process.env.NO_COLOR === '1' || !process.stdout.isTTY;
const c = (color: string, s: string) => (noColor ? s : `${color}${s}${RESET}`);

export const log = {
  info: (msg: string) => console.log(c(CYAN, '•') + ' ' + msg),
  success: (msg: string) => console.log(c(GREEN, '✓') + ' ' + msg),
  warn: (msg: string) => console.log(c(YELLOW, '!') + ' ' + msg),
  error: (msg: string) => console.error(c(RED, '✗') + ' ' + msg),
  step: (msg: string) => console.log(c(BOLD, msg)),
  dim: (msg: string) => console.log(c(DIM, msg)),
  blank: () => console.log(''),
  list: (items: string[], color = GRAY) => {
    for (const item of items) console.log(c(color, '  ' + item));
  },
};
