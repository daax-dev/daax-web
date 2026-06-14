/**
 * Catalog + releases schema (brain2daax Phase 0 — issue #93).
 *
 * Ports the two SQLite stores (catalog.db, releases.db) to Postgres DDL.
 * Type mapping per docs/brain2daax.md §2: TEXT→text, INTEGER→bigint/integer,
 * JSON-as-TEXT→jsonb, SQLite TIMESTAMP/datetime('now')→timestamptz default now().
 * AUTOINCREMENT integer PKs → bigserial.
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
  // ---- catalog.db ----
  pgm.createTable("bases", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    registry: { type: "text", notNull: true },
    repository: { type: "text", notNull: true },
    category: {
      type: "text",
      notNull: true,
      check: "category IN ('os', 'runtime')",
    },
    architecture_json: { type: "jsonb", notNull: true },
    icon: { type: "text" },
    color: { type: "text" },
    // Required to match BaseImage.securityProfile (the seed always populates it);
    // NOT NULL prevents a null flowing into the required type and crashing the UI.
    security_profile_json: { type: "jsonb", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    last_synced_at: { type: "timestamptz" },
  });

  pgm.createTable("base_versions", {
    id: { type: "bigserial", primaryKey: true },
    base_id: {
      type: "text",
      notNull: true,
      references: "bases(id)",
      onDelete: "CASCADE",
    },
    tag: { type: "text", notNull: true },
    digest: { type: "text", notNull: true },
    size: { type: "bigint" },
    created: { type: "text" },
    vulnerabilities_json: { type: "jsonb" },
  });
  pgm.addConstraint("base_versions", "base_versions_base_id_tag_key", {
    unique: ["base_id", "tag"],
  });

  pgm.createTable("features", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    documentation_url: { type: "text" },
    registry: { type: "text", notNull: true },
    repository: { type: "text", notNull: true },
    category: { type: "text", notNull: true },
    tags_json: { type: "jsonb" },
    options_json: { type: "jsonb" },
    dependencies_json: { type: "jsonb" },
    conflicts_json: { type: "jsonb" },
    compatible_bases_json: { type: "jsonb" },
    incompatible_bases_json: { type: "jsonb" },
    icon: { type: "text" },
    install_time: {
      type: "text",
      check: "install_time IN ('fast', 'medium', 'slow')",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("feature_versions", {
    id: { type: "bigserial", primaryKey: true },
    feature_id: {
      type: "text",
      notNull: true,
      references: "features(id)",
      onDelete: "CASCADE",
    },
    tag: { type: "text", notNull: true },
    digest: { type: "text", notNull: true },
    release_date: { type: "text" },
    changelog: { type: "text" },
  });
  pgm.addConstraint("feature_versions", "feature_versions_feature_id_tag_key", {
    unique: ["feature_id", "tag"],
  });

  pgm.createTable("build_specs", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    base_json: { type: "jsonb", notNull: true },
    features_json: { type: "jsonb", notNull: true },
    customizations_json: { type: "jsonb" },
    output_json: { type: "jsonb", notNull: true },
    created_by: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("build_jobs", {
    id: { type: "text", primaryKey: true },
    spec_id: {
      type: "text",
      notNull: true,
      references: "build_specs(id)",
      onDelete: "CASCADE",
    },
    status: { type: "text", notNull: true, default: "queued" },
    progress_json: { type: "jsonb" },
    result_json: { type: "jsonb" },
    error_json: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    started_at: { type: "timestamptz" },
    completed_at: { type: "timestamptz" },
  });

  pgm.createTable("built_images", {
    digest: { type: "text", primaryKey: true },
    // Retain built images when their spec/job is deleted (null the linkage).
    // Without this, deleting a spec — which cascades to its build_jobs — would
    // fail the cascade because a built image still references the job.
    spec_id: {
      type: "text",
      references: "build_specs(id)",
      onDelete: "SET NULL",
    },
    job_id: {
      type: "text",
      references: "build_jobs(id)",
      onDelete: "SET NULL",
    },
    tags_json: { type: "jsonb", notNull: true },
    size: { type: "bigint" },
    layers: { type: "integer" },
    vulnerabilities_json: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    last_scanned_at: { type: "timestamptz" },
  });

  pgm.createIndex("base_versions", "base_id", {
    name: "idx_base_versions_base",
  });
  pgm.createIndex("feature_versions", "feature_id", {
    name: "idx_feature_versions_feature",
  });
  pgm.createIndex("build_jobs", "spec_id", { name: "idx_build_jobs_spec" });
  pgm.createIndex("build_jobs", "status", { name: "idx_build_jobs_status" });
  pgm.createIndex("built_images", "spec_id", { name: "idx_built_images_spec" });

  // ---- releases.db ----
  pgm.createTable("releases", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    version: { type: "text", notNull: true },
    image_name: { type: "text", notNull: true },
    image_tag: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    built_at: { type: "timestamptz" },
    build_status: { type: "text", default: "pending" },
    build_log: { type: "text" },
    feature_config: { type: "jsonb", notNull: true },
    sbom: { type: "jsonb" },
    notes: { type: "text" },
  });

  pgm.createTable("release_shares", {
    id: { type: "bigserial", primaryKey: true },
    release_id: {
      type: "text",
      notNull: true,
      references: "releases(id)",
      onDelete: "CASCADE",
    },
    share_type: { type: "text", notNull: true },
    share_value: { type: "text", notNull: true },
    shared_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint(
    "release_shares",
    "release_shares_release_id_share_type_share_value_key",
    { unique: ["release_id", "share_type", "share_value"] },
  );

  pgm.createTable("feature_snapshots", {
    id: { type: "bigserial", primaryKey: true },
    release_id: {
      type: "text",
      notNull: true,
      references: "releases(id)",
      onDelete: "CASCADE",
    },
    plugin_id: { type: "text", notNull: true },
    plugin_name: { type: "text", notNull: true },
    maturity: { type: "text", notNull: true },
    sub_features: { type: "jsonb" },
  });
  pgm.createIndex("release_shares", "release_id", {
    name: "idx_release_shares_release",
  });
  pgm.createIndex("feature_snapshots", "release_id", {
    name: "idx_feature_snapshots_release",
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop in reverse dependency order (children before parents).
  pgm.dropTable("feature_snapshots");
  pgm.dropTable("release_shares");
  pgm.dropTable("releases");
  pgm.dropTable("built_images");
  pgm.dropTable("build_jobs");
  pgm.dropTable("build_specs");
  pgm.dropTable("feature_versions");
  pgm.dropTable("features");
  pgm.dropTable("base_versions");
  pgm.dropTable("bases");
};
