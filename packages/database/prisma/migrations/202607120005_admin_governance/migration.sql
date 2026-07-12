-- Versioned administration governance: content, notification templates,
-- feature flags, non-secret configuration, and supported locations/locales.

CREATE TYPE "GovernancePublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ConfigurationValueType" AS ENUM ('STRING', 'BOOLEAN', 'INTEGER', 'DECIMAL');

ALTER TABLE "content_pages"
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "publication_status" "GovernancePublicationStatus",
  ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "service_categories"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "procedure_definitions"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "content_pages"
SET "publication_status" = CASE
  WHEN "archived_at" IS NOT NULL THEN 'ARCHIVED'::"GovernancePublicationStatus"
  WHEN "published_at" IS NOT NULL THEN 'PUBLISHED'::"GovernancePublicationStatus"
  ELSE 'DRAFT'::"GovernancePublicationStatus"
END;

ALTER TABLE "content_pages"
  ALTER COLUMN "publication_status" SET NOT NULL,
  ALTER COLUMN "publication_status" SET DEFAULT 'DRAFT';

DROP INDEX IF EXISTS "content_pages_locale_published_at_idx";
CREATE INDEX "content_pages_locale_publication_status_published_at_idx"
  ON "content_pages"("locale", "publication_status", "published_at");

CREATE TABLE "feature_flags" (
  "id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feature_flag_versions" (
  "id" UUID NOT NULL,
  "feature_flag_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "environment" VARCHAR(40) NOT NULL,
  "audiences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reason" TEXT NOT NULL,
  "changed_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_flag_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_templates" (
  "id" UUID NOT NULL,
  "key" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "locale" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_template_versions" (
  "id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "publication_status" "GovernancePublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_configurations" (
  "id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "value_type" "ConfigurationValueType" NOT NULL,
  "secret" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_configuration_versions" (
  "id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "changed_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_configuration_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "country_configurations" (
  "id" UUID NOT NULL,
  "code" CHAR(2) NOT NULL,
  "names" JSONB NOT NULL,
  "currency" "Currency" NOT NULL,
  "calling_code" VARCHAR(8) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "country_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "city_configurations" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "names" JSONB NOT NULL,
  "timezone" VARCHAR(80) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "city_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locale_configurations" (
  "id" UUID NOT NULL,
  "locale" VARCHAR(16) NOT NULL,
  "names" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "locale_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");
CREATE UNIQUE INDEX "feature_flag_versions_feature_flag_id_version_key"
  ON "feature_flag_versions"("feature_flag_id", "version");
CREATE INDEX "feature_flag_versions_environment_created_at_idx"
  ON "feature_flag_versions"("environment", "created_at");
CREATE UNIQUE INDEX "notification_templates_key_channel_locale_key"
  ON "notification_templates"("key", "channel", "locale");
CREATE INDEX "notification_templates_category_channel_locale_idx"
  ON "notification_templates"("category", "channel", "locale");
CREATE UNIQUE INDEX "notification_template_versions_template_id_version_key"
  ON "notification_template_versions"("template_id", "version");
CREATE INDEX "notification_template_versions_template_id_publication_status_created_at_idx"
  ON "notification_template_versions"("template_id", "publication_status", "created_at");
CREATE UNIQUE INDEX "system_configurations_key_key" ON "system_configurations"("key");
CREATE UNIQUE INDEX "system_configuration_versions_configuration_id_version_key"
  ON "system_configuration_versions"("configuration_id", "version");
CREATE INDEX "system_configuration_versions_configuration_id_created_at_idx"
  ON "system_configuration_versions"("configuration_id", "created_at");
CREATE UNIQUE INDEX "country_configurations_code_key" ON "country_configurations"("code");
CREATE INDEX "country_configurations_active_code_idx" ON "country_configurations"("active", "code");
CREATE UNIQUE INDEX "city_configurations_country_id_code_key"
  ON "city_configurations"("country_id", "code");
CREATE INDEX "city_configurations_country_id_active_idx"
  ON "city_configurations"("country_id", "active");
CREATE UNIQUE INDEX "locale_configurations_locale_key" ON "locale_configurations"("locale");
CREATE INDEX "locale_configurations_active_locale_idx"
  ON "locale_configurations"("active", "locale");
CREATE UNIQUE INDEX "locale_configurations_single_default_idx"
  ON "locale_configurations"("is_default") WHERE "is_default" = true;

ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feature_flag_versions" ADD CONSTRAINT "feature_flag_versions_feature_flag_id_fkey"
  FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feature_flag_versions" ADD CONSTRAINT "feature_flag_versions_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_template_versions" ADD CONSTRAINT "notification_template_versions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_template_versions" ADD CONSTRAINT "notification_template_versions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "system_configuration_versions" ADD CONSTRAINT "system_configuration_versions_configuration_id_fkey"
  FOREIGN KEY ("configuration_id") REFERENCES "system_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "system_configuration_versions" ADD CONSTRAINT "system_configuration_versions_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "country_configurations" ADD CONSTRAINT "country_configurations_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "city_configurations" ADD CONSTRAINT "city_configurations_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "country_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "city_configurations" ADD CONSTRAINT "city_configurations_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locale_configurations" ADD CONSTRAINT "locale_configurations_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_publication_state_check" CHECK (
  ("publication_status" = 'DRAFT' AND "published_at" IS NULL AND "archived_at" IS NULL)
  OR ("publication_status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "archived_at" IS NULL)
  OR ("publication_status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
);
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_version_check"
  CHECK ("version" > 0);
ALTER TABLE "procedure_definitions" ADD CONSTRAINT "procedure_definitions_version_check"
  CHECK ("version" > 0);
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_key_check"
  CHECK ("key" ~ '^[a-z][a-z0-9_.-]{2,119}$');
ALTER TABLE "feature_flag_versions" ADD CONSTRAINT "feature_flag_versions_check" CHECK (
  "version" > 0
  AND "environment" IN ('development', 'test', 'staging', 'production', 'all')
  AND char_length(btrim("reason")) >= 12
);
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_check" CHECK (
  "locale" IN ('vi-VN', 'en-US') AND char_length(btrim("category")) > 0
);
ALTER TABLE "notification_template_versions" ADD CONSTRAINT "notification_template_versions_check" CHECK (
  "version" > 0
  AND char_length(btrim("subject")) BETWEEN 1 AND 200
  AND char_length(btrim("body")) BETWEEN 1 AND 20000
  AND char_length(btrim("reason")) >= 12
);
ALTER TABLE "system_configurations" ADD CONSTRAINT "system_configurations_non_secret_check" CHECK (
  "secret" = false AND "key" ~ '^[a-z][a-z0-9_.-]{2,119}$'
);
ALTER TABLE "system_configuration_versions" ADD CONSTRAINT "system_configuration_versions_check" CHECK (
  "version" > 0 AND char_length(btrim("reason")) >= 12 AND char_length("value") <= 4000
);
ALTER TABLE "country_configurations" ADD CONSTRAINT "country_configurations_check" CHECK (
  "code" ~ '^[A-Z]{2}$' AND "calling_code" ~ '^\\+[1-9][0-9]{0,6}$'
  AND jsonb_typeof("names") = 'object' AND "version" > 0
);
ALTER TABLE "city_configurations" ADD CONSTRAINT "city_configurations_check" CHECK (
  "code" ~ '^[a-z0-9][a-z0-9-]{1,79}$' AND char_length(btrim("timezone")) > 0
  AND jsonb_typeof("names") = 'object' AND "version" > 0
);
ALTER TABLE "locale_configurations" ADD CONSTRAINT "locale_configurations_check" CHECK (
  "locale" IN ('vi-VN', 'en-US') AND jsonb_typeof("names") = 'object' AND "version" > 0
  AND (NOT "is_default" OR "active")
);

CREATE FUNCTION "validate_system_configuration_value"() RETURNS trigger AS $$
DECLARE
  configured_type "ConfigurationValueType";
BEGIN
  SELECT "value_type" INTO configured_type
  FROM "system_configurations"
  WHERE "id" = NEW."configuration_id";
  IF configured_type = 'BOOLEAN' AND NEW."value" NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'boolean configuration values must be true or false' USING ERRCODE = '23514';
  ELSIF configured_type = 'INTEGER' AND NEW."value" !~ '^-?[0-9]+$' THEN
    RAISE EXCEPTION 'integer configuration value is invalid' USING ERRCODE = '23514';
  ELSIF configured_type = 'DECIMAL' AND NEW."value" !~ '^-?[0-9]+(\\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'decimal configuration value is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "system_configuration_value_type_check"
  BEFORE INSERT ON "system_configuration_versions"
  FOR EACH ROW EXECUTE FUNCTION "validate_system_configuration_value"();

CREATE TRIGGER "content_pages_append_only"
  BEFORE UPDATE OR DELETE ON "content_pages"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "feature_flag_versions_append_only"
  BEFORE UPDATE OR DELETE ON "feature_flag_versions"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "notification_template_versions_append_only"
  BEFORE UPDATE OR DELETE ON "notification_template_versions"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
CREATE TRIGGER "system_configuration_versions_append_only"
  BEFORE UPDATE OR DELETE ON "system_configuration_versions"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
