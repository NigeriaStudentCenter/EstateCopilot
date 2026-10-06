// Sets the App Review demo TENANT login on the live database: the tenant of
// the demo landlord's (support@estatecopilot.org) tenancy gets the email
// below and a password you type (hidden; only its scrypt hash is stored, same
// format as src/lib/passwords.ts). The nightly demo reset keeps this login
// working even if a reviewer deletes the account.
// Run:  node backend/scripts/set-demo-tenant.mjs                      (type a password)
//       node backend/scripts/set-demo-tenant.mjs --same-as-landlord   (reuse the landlord's)
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

const LANDLORD = 'support@estatecopilot.org';
const EMAIL = 'demo.tenant@estatecopilot.org';

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        if (c === '\u007f' || c === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          value += c;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

// --same-as-landlord: copy the demo landlord's password (its stored hash) to
// the demo tenant, so nobody has to type it.
const sameAsLandlord = process.argv.includes('--same-as-landlord');

const pw = sameAsLandlord ? '' : await askHidden(`New password for the demo tenant ${EMAIL}: `);
const again = sameAsLandlord ? '' : await askHidden('Type it again: ');
if (pw !== again) {
  console.error('Passwords did not match — nothing changed.');
  process.exit(1);
}
if (!sameAsLandlord && pw.length < 8) {
  console.error('Use at least 8 characters — nothing changed.');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = sameAsLandlord ? '' : `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;

const dbUrl = execFileSync('az', [
  'webapp', 'config', 'appsettings', 'list', '-g', 'estatecopilot-rg', '-n', 'estatecopilot-api',
  '--query', "[?name=='DATABASE_URL'].value", '-o', 'tsv',
]).toString().trim();

// The demo landlord's first tenancy's tenant becomes the demo tenant login.
const sql = `
update "Tenant" set email = :'e', "passwordHash" = ${sameAsLandlord ? `(select "passwordHash" from "Landlord" where email = :'l')` : `:'h'`}
where id = (
  select t."tenantId" from "Tenancy" t
  join "Property" p on p.id = t."propertyId"
  join "Landlord" l on l.id = p."landlordId"
  where l.email = :'l'
  order by t."leaseStart" asc limit 1
)
returning name, email;
`;
const out = execFileSync('psql', [dbUrl, '-At', '-v', `h=${hash}`, '-v', `e=${EMAIL}`, '-v', `l=${LANDLORD}`, '-f', '-'], { input: sql }).toString();

console.log(out.includes(EMAIL)
  ? `Done — sign in as a tenant with ${EMAIL} and ${sameAsLandlord ? "the demo landlord's password" : 'the password you typed'}.`
  : 'No tenant updated — tell Claude.');
