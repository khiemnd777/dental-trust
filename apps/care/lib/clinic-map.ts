export interface MapCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MapClinicInput {
  readonly id: string;
  readonly coordinates: MapCoordinates | null;
}

export interface ClinicMapLocationInput {
  readonly address: string;
  readonly coordinates: MapCoordinates | null;
}

export interface ClinicMapPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface TrustEvidenceInput {
  readonly category: string;
}

export interface ClinicTrustSignal {
  readonly key: string;
  readonly label: string;
  readonly verified: boolean;
}

const trustDefinitions = [
  {
    key: 'operating-license',
    label: 'Giấy phép hoạt động',
    requiredCategories: ['CLINIC_OPERATING_LICENSE'],
  },
  {
    key: 'dentist-credentials',
    label: 'Bằng cấp bác sĩ',
    requiredCategories: ['DENTIST_PRACTICE_LICENSE', 'DENTIST_CLINIC_AFFILIATION'],
  },
  {
    key: 'clinical-safety',
    label: 'An toàn lâm sàng',
    requiredCategories: ['INFECTION_CONTROL_PROCESS', 'EMERGENCY_PROCEDURES'],
  },
  {
    key: 'international-support',
    label: 'Hỗ trợ bệnh nhân quốc tế',
    requiredCategories: ['INTERNATIONAL_PATIENT_SUPPORT'],
  },
] as const;

export const clinicTrustSignalCount = trustDefinitions.length;
export const defaultClinicMapCenter: MapCoordinates = {
  latitude: 10.7769,
  longitude: 106.7009,
};

export function clinicHasMapLocation<T extends ClinicMapLocationInput>(
  clinic: T,
): clinic is T & { readonly coordinates: MapCoordinates } {
  return clinic.coordinates !== null && clinic.address.trim().length > 0;
}

export function clinicTrustSignals(
  evidence: readonly TrustEvidenceInput[],
): readonly ClinicTrustSignal[] {
  const categories = new Set(evidence.map((item) => item.category));
  return trustDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    verified: definition.requiredCategories.every((category) => categories.has(category)),
  }));
}

export function clinicMapInitialCenter(
  clinics: readonly MapClinicInput[],
  userCoordinates: MapCoordinates | null,
): MapCoordinates {
  if (userCoordinates) return userCoordinates;
  return (
    clinics.find(({ coordinates }) => coordinates !== null)?.coordinates ?? defaultClinicMapCenter
  );
}

export function clinicMapViewportPadding(
  viewportWidth: number,
  hasDetailsSheet: boolean,
): ClinicMapPadding {
  if (viewportWidth <= 704) {
    return {
      top: 112,
      right: 42,
      bottom: hasDetailsSheet ? 430 : 160,
      left: 42,
    };
  }
  return {
    top: 112,
    right: 72,
    bottom: hasDetailsSheet ? 330 : 120,
    left: 72,
  };
}

export function clinicMapShortName(name: string): string {
  const compactName =
    name
      .replace(/\b(?:nha khoa|dental|center|clinic|verified)\b/giu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .split(' ')
      .slice(0, 2)
      .join(' ') || name;
  return /^\d+$/u.test(compactName) ? `Nha khoa ${compactName}` : compactName;
}

export function straightLineDistanceKm(
  origin: MapCoordinates,
  destination: MapCoordinates,
): number {
  const earthRadiusKm = 6_371;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}
