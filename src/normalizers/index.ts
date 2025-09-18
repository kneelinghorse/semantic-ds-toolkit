export * from './email';
export * from './phone';
export * from './name';
export * from './address';
export * from './uuid';

import { EmailNormalizer } from './email';
import { PhoneNormalizer } from './phone';
import { NameNormalizer } from './name';
import { AddressNormalizer } from './address';
import { UuidNormalizer } from './uuid';

export interface NormalizerConfig {
  email?: ConstructorParameters<typeof EmailNormalizer>[0];
  phone?: ConstructorParameters<typeof PhoneNormalizer>[0];
  name?: ConstructorParameters<typeof NameNormalizer>[0];
  address?: ConstructorParameters<typeof AddressNormalizer>[0];
  uuid?: ConstructorParameters<typeof UuidNormalizer>[0];
}

export class SemanticNormalizer {
  private emailNormalizer: EmailNormalizer;
  private phoneNormalizer: PhoneNormalizer;
  private nameNormalizer: NameNormalizer;
  private addressNormalizer: AddressNormalizer;
  private uuidNormalizer: UuidNormalizer;

  constructor(config: NormalizerConfig = {}) {
    this.emailNormalizer = new EmailNormalizer(config.email);
    this.phoneNormalizer = new PhoneNormalizer(config.phone);
    this.nameNormalizer = new NameNormalizer(config.name);
    this.addressNormalizer = new AddressNormalizer(config.address);
    this.uuidNormalizer = new UuidNormalizer(config.uuid);
  }

  normalizeEmail(email: string) {
    return this.emailNormalizer.normalize(email);
  }

  normalizePhone(phone: string) {
    return this.phoneNormalizer.normalize(phone);
  }

  normalizeName(name: string) {
    return this.nameNormalizer.normalize(name);
  }

  normalizeAddress(address: string) {
    return this.addressNormalizer.normalize(address);
  }

  normalizeUuid(uuid: string) {
    return this.uuidNormalizer.normalize(uuid);
  }

  normalizeField(value: string, type: 'email' | 'phone' | 'name' | 'address' | 'uuid') {
    switch (type) {
      case 'email':
        return this.normalizeEmail(value);
      case 'phone':
        return this.normalizePhone(value);
      case 'name':
        return this.normalizeName(value);
      case 'address':
        return this.normalizeAddress(value);
      case 'uuid':
        return this.normalizeUuid(value);
      default:
        throw new Error(`Unknown field type: ${type}`);
    }
  }
}