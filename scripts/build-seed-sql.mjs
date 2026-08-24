import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const [statePath, outputPath, ownerId] = process.argv.slice(2);
if (!statePath || !outputPath || !/^\d+$/.test(ownerId ?? '')) {
  throw new Error('Usage: node scripts/build-seed-sql.mjs <state.json> <output.sql> <miaoda-user-id>');
}
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const json = JSON.stringify(state).replaceAll("'", "''");
const profile = `(${ownerId})`;
const sql = `BEGIN;
DELETE FROM workspace_document WHERE (owner_profile).user_id = '${ownerId}';
INSERT INTO workspace_document (
  owner_profile, schema_version, state, _created_at, _created_by, _updated_at, _updated_by
) VALUES (
  '${profile}'::user_profile,
  'barry_workspace_v1',
  '${json}'::jsonb,
  CURRENT_TIMESTAMP,
  '${profile}'::user_profile,
  CURRENT_TIMESTAMP,
  '${profile}'::user_profile
);
COMMIT;
`;
writeFileSync(outputPath, sql, { mode: 0o600 });
chmodSync(outputPath, 0o600);
process.stdout.write(JSON.stringify({ bytes: Buffer.byteLength(sql), collections: Object.keys(state).length }) + '\n');
