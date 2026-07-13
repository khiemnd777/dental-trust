import { describe, expect, it } from 'vitest';

import { projectJourney } from '../src/journey-summary.js';

describe('journey summary projection', () => {
  it('gives the patient one clear action while a treatment plan is ready', () => {
    expect(
      projectJourney({ status: 'TREATMENT_PLANS_READY', perspective: 'PATIENT' }),
    ).toMatchObject({
      stage: 'PLAN_REVIEW',
      primaryActionCode: 'REVIEW_PLANS',
      ownerType: 'PATIENT',
      urgency: 'ATTENTION',
    });
  });

  it('routes clinic-owned work to the clinic queue', () => {
    expect(
      projectJourney({ status: 'TREATMENT_PLANS_PENDING', perspective: 'CLINIC' }),
    ).toMatchObject({
      primaryActionCode: 'PREPARE_PLAN',
      ownerType: 'CLINIC',
      blockerCodes: ['PLAN_REQUIRED'],
    });
  });

  it('elevates an open incident above the normal case state', () => {
    expect(
      projectJourney({
        status: 'AFTERCARE_ACTIVE',
        perspective: 'PATIENT',
        hasOpenIncident: true,
      }),
    ).toMatchObject({
      stage: 'WARRANTY',
      primaryActionCode: 'VIEW_INCIDENT',
      urgency: 'URGENT',
      blockerCodes: ['INCIDENT_OPEN'],
    });
  });
});
