const { appendFileSync, readFileSync, statSync } = require('node:fs');

const pairs = [
  ['diary-private-append-20261031e.md', 'C:\\Users\\<你的用户名>\\.dsh\\whale-diary-private.md'],
];
const base = 'C:\\Users\\<你的用户名>\\.dsh\\whale-work\\';
for (const [src, dst] of pairs) {
  appendFileSync(dst, readFileSync(base + src, 'utf8'), 'utf8');
  console.log(dst, statSync(dst).size);
}
