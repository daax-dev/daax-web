/**
 * Add built_images.sbom_json (F2 — issue #97).
 *
 * Stores the real (syft-generated) SBOM against the built image it describes,
 * keyed by the image digest (the built_images PK). Nullable: a row may exist
 * before its SBOM is produced, or the placeholder-vs-real guard may reject an
 * empty/undersized SBOM (in which case the slot stays null = "unavailable",
 * never a synthetic stand-in).
 *
 * Plain CommonJS so the production image runs migrations without a TS transform.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn("built_images", {
    sbom_json: { type: "jsonb" },
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("built_images", "sbom_json");
};
