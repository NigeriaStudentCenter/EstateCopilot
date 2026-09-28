// Sets a new password for the demo landlord (support@estatecopilot.org) on the
// live database. Asks for the password with hidden typing and stores only its
// scrypt hash (same format as src/lib/passwords.ts).
// Run:  node backend/scripts/set-demo-password.mjs
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

const EMAIL = 'support@estatecopilot.org';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const pw = await askHidden(`New password for ${EMAIL}: `);
const again = await askHidden('Type it again: ');
if (pw !== again) {
  console.error('Passwords did not match — nothing changed.');
  process.exit(1);
}
if (pw.length < 8) {
  console.error('Use at least 8 characters — nothing changed.');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;

const dbUrl = execFileSync('az', [
  'webapp', 'config', 'appsettings', 'list', '-g', 'estatecopilot-rg', '-n', 'estatecopilot-api',
  '--query', "[?name=='DATABASE_URL'].value", '-o', 'tsv',
]).toString().trim();

// psql only substitutes :'h' / :'e' in script input (not with -c), so the SQL goes in on stdin.
const out = execFileSync('psql', [dbUrl, '-At', '-v', `h=${hash}`, '-v', `e=${EMAIL}`, '-f', '-'], {
  input: `update "Landlord" set "passwordHash" = :'h' where email = :'e' returning email;\n`,
}).toString();

console.log(out.includes(EMAIL) ? `Done — ${EMAIL} can sign in with the new password.` : 'No account updated — tell Claude.');
