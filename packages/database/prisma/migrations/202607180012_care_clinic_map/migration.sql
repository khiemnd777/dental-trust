ALTER TABLE "clinic_locations"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "clinic_locations"
  ADD CONSTRAINT "clinic_locations_coordinates_pair_check"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL)
      OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)
    ),
  ADD CONSTRAINT "clinic_locations_latitude_range_check"
    CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "clinic_locations_longitude_range_check"
    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

CREATE INDEX "clinic_locations_city_active_coordinates_idx"
  ON "clinic_locations"("city", "active", "latitude", "longitude")
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
