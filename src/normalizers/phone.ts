export interface PhoneNormalizationOptions {
  defaultCountryCode?: string;
  formatE164?: boolean;
  removeFormatting?: boolean;
}

export interface NormalizedPhone {
  normalized: string;
  original: string;
  confidence: number;
  countryCode?: string;
  nationalNumber?: string;
  isValid: boolean;
  format: 'E164' | 'NATIONAL' | 'INTERNATIONAL' | 'UNKNOWN';
}

const COUNTRY_CODES = new Map([
  ['1', { name: 'US/Canada', maxLength: 10 }],
  ['44', { name: 'UK', maxLength: 10 }],
  ['49', { name: 'Germany', maxLength: 11 }],
  ['33', { name: 'France', maxLength: 9 }],
  ['81', { name: 'Japan', maxLength: 10 }],
  ['86', { name: 'China', maxLength: 11 }],
  ['91', { name: 'India', maxLength: 10 }],
  ['55', { name: 'Brazil', maxLength: 11 }],
  ['61', { name: 'Australia', maxLength: 9 }],
  ['7', { name: 'Russia', maxLength: 10 }],
  ['39', { name: 'Italy', maxLength: 10 }],
  ['34', { name: 'Spain', maxLength: 9 }],
  ['31', { name: 'Netherlands', maxLength: 9 }],
  ['46', { name: 'Sweden', maxLength: 9 }],
  ['47', { name: 'Norway', maxLength: 8 }],
  ['45', { name: 'Denmark', maxLength: 8 }],
  ['41', { name: 'Switzerland', maxLength: 9 }],
  ['43', { name: 'Austria', maxLength: 10 }],
  ['32', { name: 'Belgium', maxLength: 9 }],
  ['351', { name: 'Portugal', maxLength: 9 }],
  ['30', { name: 'Greece', maxLength: 10 }],
  ['48', { name: 'Poland', maxLength: 9 }],
  ['420', { name: 'Czech Republic', maxLength: 9 }],
  ['36', { name: 'Hungary', maxLength: 9 }],
  ['40', { name: 'Romania', maxLength: 10 }],
  ['385', { name: 'Croatia', maxLength: 8 }],
  ['386', { name: 'Slovenia', maxLength: 8 }],
  ['421', { name: 'Slovakia', maxLength: 9 }],
  ['370', { name: 'Lithuania', maxLength: 8 }],
  ['371', { name: 'Latvia', maxLength: 8 }],
  ['372', { name: 'Estonia', maxLength: 8 }],
  ['358', { name: 'Finland', maxLength: 9 }],
  ['354', { name: 'Iceland', maxLength: 7 }],
  ['353', { name: 'Ireland', maxLength: 9 }],
  ['356', { name: 'Malta', maxLength: 8 }],
  ['357', { name: 'Cyprus', maxLength: 8 }],
  ['352', { name: 'Luxembourg', maxLength: 9 }],
  ['377', { name: 'Monaco', maxLength: 8 }],
  ['378', { name: 'San Marino', maxLength: 10 }],
  ['379', { name: 'Vatican', maxLength: 10 }],
  ['380', { name: 'Ukraine', maxLength: 9 }],
  ['375', { name: 'Belarus', maxLength: 9 }],
  ['374', { name: 'Armenia', maxLength: 8 }],
  ['995', { name: 'Georgia', maxLength: 9 }],
  ['994', { name: 'Azerbaijan', maxLength: 9 }],
  ['993', { name: 'Turkmenistan', maxLength: 8 }],
  ['992', { name: 'Tajikistan', maxLength: 9 }],
  ['998', { name: 'Uzbekistan', maxLength: 9 }],
  ['996', { name: 'Kyrgyzstan', maxLength: 9 }],
  ['212', { name: 'Morocco', maxLength: 9 }],
  ['213', { name: 'Algeria', maxLength: 9 }],
  ['216', { name: 'Tunisia', maxLength: 8 }],
  ['218', { name: 'Libya', maxLength: 9 }],
  ['220', { name: 'Gambia', maxLength: 7 }],
  ['221', { name: 'Senegal', maxLength: 9 }],
  ['222', { name: 'Mauritania', maxLength: 8 }],
  ['223', { name: 'Mali', maxLength: 8 }],
  ['224', { name: 'Guinea', maxLength: 9 }],
  ['225', { name: 'Ivory Coast', maxLength: 8 }],
  ['226', { name: 'Burkina Faso', maxLength: 8 }],
  ['227', { name: 'Niger', maxLength: 8 }],
  ['228', { name: 'Togo', maxLength: 8 }],
  ['229', { name: 'Benin', maxLength: 8 }],
  ['230', { name: 'Mauritius', maxLength: 7 }],
  ['231', { name: 'Liberia', maxLength: 8 }],
  ['232', { name: 'Sierra Leone', maxLength: 8 }],
  ['233', { name: 'Ghana', maxLength: 9 }],
  ['234', { name: 'Nigeria', maxLength: 10 }],
  ['235', { name: 'Chad', maxLength: 8 }],
  ['236', { name: 'Central African Republic', maxLength: 8 }],
  ['237', { name: 'Cameroon', maxLength: 9 }],
  ['238', { name: 'Cape Verde', maxLength: 7 }],
  ['239', { name: 'Sao Tome and Principe', maxLength: 7 }],
  ['240', { name: 'Equatorial Guinea', maxLength: 9 }],
  ['241', { name: 'Gabon', maxLength: 8 }],
  ['242', { name: 'Republic of the Congo', maxLength: 9 }],
  ['243', { name: 'Democratic Republic of the Congo', maxLength: 9 }],
  ['244', { name: 'Angola', maxLength: 9 }],
  ['245', { name: 'Guinea-Bissau', maxLength: 7 }],
  ['246', { name: 'British Indian Ocean Territory', maxLength: 7 }],
  ['248', { name: 'Seychelles', maxLength: 7 }],
  ['249', { name: 'Sudan', maxLength: 9 }],
  ['250', { name: 'Rwanda', maxLength: 9 }],
  ['251', { name: 'Ethiopia', maxLength: 9 }],
  ['252', { name: 'Somalia', maxLength: 8 }],
  ['253', { name: 'Djibouti', maxLength: 8 }],
  ['254', { name: 'Kenya', maxLength: 9 }],
  ['255', { name: 'Tanzania', maxLength: 9 }],
  ['256', { name: 'Uganda', maxLength: 9 }],
  ['257', { name: 'Burundi', maxLength: 8 }],
  ['258', { name: 'Mozambique', maxLength: 9 }],
  ['260', { name: 'Zambia', maxLength: 9 }],
  ['261', { name: 'Madagascar', maxLength: 9 }],
  ['262', { name: 'Reunion', maxLength: 9 }],
  ['263', { name: 'Zimbabwe', maxLength: 9 }],
  ['264', { name: 'Namibia', maxLength: 7 }],
  ['265', { name: 'Malawi', maxLength: 9 }],
  ['266', { name: 'Lesotho', maxLength: 8 }],
  ['267', { name: 'Botswana', maxLength: 8 }],
  ['268', { name: 'Swaziland', maxLength: 8 }],
  ['269', { name: 'Comoros', maxLength: 7 }],
  ['27', { name: 'South Africa', maxLength: 9 }],
]);

export class PhoneNormalizer {
  private options: Required<PhoneNormalizationOptions>;

  constructor(options: PhoneNormalizationOptions = {}) {
    this.options = {
      defaultCountryCode: '1',
      formatE164: true,
      removeFormatting: true,
      ...options
    };
  }

  normalize(phone: string): NormalizedPhone {
    const original = phone;
    let normalized = phone.trim();

    if (this.options.removeFormatting) {
      normalized = this.removeFormatting(normalized);
    }

    const parseResult = this.parsePhone(normalized);

    if (!parseResult.isValid) {
      return {
        normalized: original,
        original,
        confidence: 0,
        isValid: false,
        format: 'UNKNOWN'
      };
    }

    const { countryCode, nationalNumber } = parseResult;

    let finalFormat: 'E164' | 'NATIONAL' | 'INTERNATIONAL' = 'E164';
    let finalNormalized = normalized;

    if (this.options.formatE164) {
      finalNormalized = `+${countryCode}${nationalNumber}`;
      finalFormat = 'E164';
    } else {
      finalNormalized = normalized;
      finalFormat = 'NATIONAL';
    }

    const confidence = this.calculateConfidence(original, finalNormalized, parseResult);

    return {
      normalized: finalNormalized,
      original,
      confidence,
      countryCode,
      nationalNumber,
      isValid: parseResult.isValid,
      format: finalFormat
    };
  }

  private removeFormatting(phone: string): string {
    return phone.replace(/[\s\-\(\)\.\+]/g, '');
  }

  private parsePhone(phone: string): {
    countryCode?: string;
    nationalNumber?: string;
    isValid: boolean;
  } {
    let cleanPhone = phone;

    if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.substring(2);
    }

    if (!/^\d+$/.test(cleanPhone)) {
      return { isValid: false };
    }

    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { isValid: false };
    }

    const possibleCountryCodes = this.findPossibleCountryCodes(cleanPhone);

    if (cleanPhone.length === 10 && !cleanPhone.startsWith('0')) {
      return {
        countryCode: this.options.defaultCountryCode,
        nationalNumber: cleanPhone,
        isValid: true
      };
    }

    for (const countryCode of possibleCountryCodes) {
      const nationalNumber = cleanPhone.substring(countryCode.length);
      const countryInfo = COUNTRY_CODES.get(countryCode);

      if (countryInfo && nationalNumber.length <= countryInfo.maxLength && nationalNumber.length >= 7) {
        return {
          countryCode,
          nationalNumber,
          isValid: true
        };
      }
    }

    return { isValid: false };
  }

  private findPossibleCountryCodes(phone: string): string[] {
    const codes: string[] = [];

    for (const [code] of COUNTRY_CODES) {
      if (phone.startsWith(code)) {
        codes.push(code);
      }
    }

    return codes.sort((a, b) => b.length - a.length);
  }

  private calculateConfidence(
    original: string,
    normalized: string,
    parseResult: { countryCode?: string; nationalNumber?: string; isValid: boolean }
  ): number {
    if (!parseResult.isValid) return 0;

    let confidence = 0.9;

    const cleanOriginal = this.removeFormatting(original);
    const cleanNormalized = this.removeFormatting(normalized);

    if (cleanOriginal === cleanNormalized) {
      confidence = 1.0;
    }

    if (parseResult.countryCode === this.options.defaultCountryCode) {
      confidence *= 0.95;
    }

    const countryInfo = COUNTRY_CODES.get(parseResult.countryCode!);
    if (countryInfo && parseResult.nationalNumber) {
      const lengthRatio = parseResult.nationalNumber.length / countryInfo.maxLength;
      if (lengthRatio < 0.7) {
        confidence *= 0.8;
      }
    }

    return Math.max(0.1, confidence);
  }

  formatNational(phone: string): string | null {
    const result = this.normalize(phone);
    if (!result.isValid || !result.nationalNumber) return null;

    if (result.countryCode === '1') {
      const national = result.nationalNumber;
      if (national.length === 10) {
        return `(${national.substring(0, 3)}) ${national.substring(3, 6)}-${national.substring(6)}`;
      }
    }

    return result.nationalNumber;
  }

  formatInternational(phone: string): string | null {
    const result = this.normalize(phone);
    if (!result.isValid || !result.countryCode || !result.nationalNumber) return null;

    return `+${result.countryCode} ${result.nationalNumber}`;
  }
}

export function normalizePhone(phone: string, options?: PhoneNormalizationOptions): NormalizedPhone {
  const normalizer = new PhoneNormalizer(options);
  return normalizer.normalize(phone);
}