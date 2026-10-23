// Generates a random CARD_SIGNING_KEY and stores it as a Worker secret without printing it.
// Run from apps/worker:  node ../../tools/set-card-key.mjs
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const key = randomBytes(32).toString('base64url');
const child = spawn('npx', ['wrangler', 'secret', 'put', 'CARD_SIGNING_KEY'], { stdio: ['pipe', 'inherit', 'inherit'], shell: true });
child.stdin.end(key);
child.on('exit', (code) => {
  console.log(code === 0 ? '\nCARD_SIGNING_KEY set.' : `\nwrangler exited with code ${code}`);
  process.exit(code ?? 1);
});
