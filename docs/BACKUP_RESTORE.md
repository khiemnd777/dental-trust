# Backup and restore

## Policy

PostgreSQL is backed up with provider-native encrypted snapshots and point-in-time recovery plus periodic logical backups. Private object storage uses versioning/replication and lifecycle rules. Redis is not the only copy of critical business state; queue intent is recoverable from PostgreSQL outbox records.

Production owners must approve RPO, RTO, retention, region/account separation, legal holds, and restore access. Until approved, no numeric recovery guarantee is claimed.

## Logical backup

With PostgreSQL client tools installed and a read-authorized URL:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIRECTORY='/secure/encrypted/path'
scripts/backup-postgres.sh
```

The helper creates a custom-format dump with a checksum and restrictive permissions. Encrypt and upload it to the approved backup store; never retain production dumps on a developer laptop or attach them to tickets.

Back up object metadata and object bytes from a consistent recovery window. Record application version, migration state, database snapshot/PITR timestamp, bucket version markers, encryption-key version, and checksum manifest.

## Restore rehearsal

Always restore first into an isolated network/account with no email/payment/webhook egress.

```bash
export DATABASE_URL='postgresql://isolated-restore-target/...'
export ALLOW_DESTRUCTIVE_RESTORE=true
scripts/restore-postgres.sh /secure/path/dental-trust-YYYYMMDDTHHMMSSZ.dump
pnpm db:migrate:deploy
```

Then:

1. Verify checksum, restore logs, schema/migration state, row counts, foreign-key integrity, tenant sample isolation, encrypted-field decryptability, audit/outbox continuity, and latest accepted plan/payment states.
2. Restore the matching private-object versions and confirm database/object hashes and quarantine/scan metadata.
3. Reapply privacy deletion/anonymization records newer than the restored point before any serving traffic.
4. Keep outbound providers disabled; drain/reconcile outbox and webhook events deliberately to avoid duplicate notifications or payments.
5. Run application smoke and negative-authorization tests; record actual RPO/RTO and gaps.
6. Destroy the rehearsal environment and its derived credentials/exports according to policy.

## Disaster recovery

Declare an incident, select the last known-good recovery point, preserve compromised evidence, rotate affected credentials/keys, restore data/services into a clean environment, validate with two-person approval, update DNS/traffic, and monitor. Key loss is not solved by backups unless an approved recoverable key-management design exists.

Run restore exercises at least quarterly and after material schema, storage, encryption, or provider changes.
