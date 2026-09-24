/** Run OFFLINE by the independent onboarding custodian, never inside Admin Console or the app server.
 * node issue-owner-activation.mjs <owner UUID> <organisation UUID> <new output directory>
 * Deliver owner-activation.txt independently/in person. Register verifier.sql using independent DB authority.
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [owner, org, output] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuid.test(owner ?? '') || !uuid.test(org ?? '') || !output) throw new Error('Owner UUID, organisation UUID and new output directory required.');
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKey = pair.publicKey.export({ format:'der', type:'spki' }).toString('base64url');
const privateKey = pair.privateKey.export({ format:'der', type:'pkcs8' }).toString('base64url');
mkdirSync(output, { mode: 0o700 });
writeFileSync(join(output,'owner-activation.txt'), `SCPO-A1.${org}.${owner}.${privateKey}\n`, {mode:0o600,flag:'wx'});
writeFileSync(join(output,'verifier.sql'), `-- Run only through independent onboarding custody. No secret in this file.\nSET ROLE private_office_issuer;\nINSERT INTO public.private_office_activations (owner_profile_id,organisation_id,public_key) VALUES ('${owner}','${org}','${publicKey}');\nRESET ROLE;\n`, {mode:0o600,flag:'wx'});
console.log('Owner artifact and public verifier written to the chosen directory. No secret printed.');
