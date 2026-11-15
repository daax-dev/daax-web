/**
 * Enforce `auth_audit` append-only at the DATABASE (R2).
 *
 * The original rbac-identity migration documented auth_audit as an "append-only
 * decision log", but that was a COMMENT only — nothing stopped an UPDATE/DELETE,
 * so the super-admin DB console (write mode) could silently delete or rewrite
 * audit rows, defeating the purpose of a security audit trail. This migration
 * makes the guarantee real with a BEFORE UPDATE OR DELETE trigger that raises an
 * exception, so the enforcement holds regardless of the connecting role (a
 * REVOKE would not bind the table owner the app connects as).
 *
 * Scope decision: this blocks UPDATE and DELETE — the vectors the premortem
 * named (the admin DB console does whitelisted DML with bound values, so a
 * console DELETE is the real tampering path). TRUNCATE is deliberately NOT
 * blocked: it requires table-owner/superuser privilege (a role that can disable
 * the trigger anyway, so a TRUNCATE trigger adds no real control against the
 * console threat) and blocking it breaks the integration suite's `TRUNCATE
 * auth_audit` fixture reset. Retention/pruning, if ever needed, must be a
 * deliberate future migration that drops the trigger, prunes, and re-adds it —
 * never an ad-hoc console DELETE.
 *
 * INSERTs are unaffected (the log keeps appending).
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION auth_audit_append_only()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'auth_audit is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
    END;
    $$ LANGUAGE plpgsql;
  `);
  pgm.sql(`
    CREATE TRIGGER auth_audit_no_mutate
      BEFORE UPDATE OR DELETE ON auth_audit
      FOR EACH ROW EXECUTE FUNCTION auth_audit_append_only();
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql("DROP TRIGGER IF EXISTS auth_audit_no_mutate ON auth_audit");
  pgm.sql("DROP FUNCTION IF EXISTS auth_audit_append_only()");
};
