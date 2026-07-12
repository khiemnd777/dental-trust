import { randomBytes } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type {
  ClinicDiscoveryQuery,
  ContactRequest,
  PublicDirectoryQuery,
} from '@dental-trust/contracts';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  ContactIdempotencyConflictError,
  MatchingConciergeRepository,
  PublicRepository,
  type PrismaClient,
} from '@dental-trust/database';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { PRISMA, SERVER_ENV } from '../common/tokens.js';

@Injectable()
export class PublicService {
  private readonly repository: PublicRepository;
  private readonly matching: MatchingConciergeRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
  ) {
    this.repository = new PublicRepository(database);
    this.matching = new MatchingConciergeRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  async clinics(query: ClinicDiscoveryQuery) {
    return this.matching.searchClinics({
      locale: query.locale,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.district ? { district: query.district } : {}),
      ...(query.procedureCode ? { procedureCode: query.procedureCode } : {}),
      ...(query.dentistSpecialization
        ? { dentistSpecialization: query.dentistSpecialization }
        : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.consultationAvailableBy
        ? { consultationAvailableBy: query.consultationAvailableBy }
        : {}),
      ...(query.minimumPriceMinor !== undefined
        ? { minimumPriceMinor: query.minimumPriceMinor }
        : {}),
      ...(query.maximumPriceMinor !== undefined
        ? { maximumPriceMinor: query.maximumPriceMinor }
        : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.equipment ? { equipment: query.equipment } : {}),
      ...(query.aftercareSupport !== undefined ? { aftercareSupport: query.aftercareSupport } : {}),
      ...(query.warrantyAvailable !== undefined
        ? { warrantyAvailable: query.warrantyAvailable }
        : {}),
      ...(query.accessibility ? { accessibility: query.accessibility } : {}),
      ...(query.minimumRating !== undefined ? { minimumRating: query.minimumRating } : {}),
      ...(query.followUpDataAvailable !== undefined
        ? { followUpDataAvailable: query.followUpDataAvailable }
        : {}),
    });
  }

  async dentists(query: PublicDirectoryQuery) {
    return this.repository.listDentists({
      locale: query.locale,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
  }

  async clinic(slug: string, locale: 'vi-VN' | 'en-US') {
    const clinic = await this.repository.findClinic(slug, locale);
    if (!clinic) throw new NotFoundException();
    return clinic;
  }

  async dentist(slug: string, locale: 'vi-VN' | 'en-US') {
    const dentist = await this.repository.findDentist(slug, locale);
    if (!dentist) throw new NotFoundException();
    return dentist;
  }

  async contact(
    input: ContactRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ readonly accepted: true; readonly reference: string }> {
    const reference = `DT-SUP-${randomBytes(6).toString('hex').toUpperCase()}`;
    const context = `contact:${reference}`;
    const requestHash = sha256(
      JSON.stringify([input.name, input.email, input.topic, input.message, input.locale]),
    );
    let contact: { readonly id: string; readonly reference: string };
    try {
      contact = await this.repository.createContact({
        reference,
        encryptedName: this.cipher.encrypt(input.name, `${context}:name`),
        encryptedEmail: this.cipher.encrypt(input.email, `${context}:email`),
        encryptedTopic: this.cipher.encrypt(input.topic, `${context}:topic`),
        encryptedMessage: this.cipher.encrypt(input.message, `${context}:message`),
        locale: input.locale,
        requestId,
        idempotencyKey,
        requestHash,
      });
    } catch (error) {
      if (error instanceof ContactIdempotencyConflictError) throw new ConflictException();
      throw error;
    }
    return { accepted: true, reference: contact.reference };
  }
}
