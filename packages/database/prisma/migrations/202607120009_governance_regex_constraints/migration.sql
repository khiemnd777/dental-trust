-- Correct PostgreSQL regular-expression escaping for governance configuration.
-- Standard-conforming SQL strings preserve backslashes, so regex metacharacters
-- require one backslash rather than the two used by application string literals.
ALTER TABLE "country_configurations"
  DROP CONSTRAINT "country_configurations_check";

ALTER TABLE "country_configurations"
  ADD CONSTRAINT "country_configurations_check" CHECK (
    "code" ~ '^[A-Z]{2}$'
    AND "calling_code" ~ '^\+[1-9][0-9]{0,6}$'
    AND jsonb_typeof("names") = 'object'
    AND "version" > 0
  );

CREATE OR REPLACE FUNCTION "validate_system_configuration_value"() RETURNS trigger AS $$
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
  ELSIF configured_type = 'DECIMAL' AND NEW."value" !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'decimal configuration value is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
