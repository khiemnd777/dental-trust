CREATE INDEX "clinic_locations_active_coordinates_idx"
  ON "clinic_locations"("active", "latitude", "longitude")
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
