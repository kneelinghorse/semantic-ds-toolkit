export interface AddressNormalizationOptions {
  standardizeStreetTypes?: boolean;
  standardizeDirections?: boolean;
  standardizeStates?: boolean;
  removeExtraSpaces?: boolean;
  normalizeCase?: boolean;
  expandAbbreviations?: boolean;
}

export interface NormalizedAddress {
  normalized: string;
  original: string;
  confidence: number;
  components: {
    streetNumber?: string;
    streetName?: string;
    streetType?: string;
    unit?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  variations: string[];
}

const STREET_TYPES = new Map([
  ['st', 'Street'], ['str', 'Street'], ['street', 'Street'],
  ['ave', 'Avenue'], ['av', 'Avenue'], ['avenue', 'Avenue'],
  ['blvd', 'Boulevard'], ['boul', 'Boulevard'], ['boulevard', 'Boulevard'],
  ['rd', 'Road'], ['road', 'Road'],
  ['dr', 'Drive'], ['drv', 'Drive'], ['drive', 'Drive'],
  ['ln', 'Lane'], ['lane', 'Lane'],
  ['ct', 'Court'], ['crt', 'Court'], ['court', 'Court'],
  ['cir', 'Circle'], ['circ', 'Circle'], ['circle', 'Circle'],
  ['pl', 'Place'], ['plc', 'Place'], ['place', 'Place'],
  ['way', 'Way'], ['wy', 'Way'],
  ['ter', 'Terrace'], ['terr', 'Terrace'], ['terrace', 'Terrace'],
  ['pkwy', 'Parkway'], ['pky', 'Parkway'], ['parkway', 'Parkway'],
  ['hwy', 'Highway'], ['highway', 'Highway'],
  ['fwy', 'Freeway'], ['freeway', 'Freeway'],
  ['expy', 'Expressway'], ['expressway', 'Expressway'],
  ['trl', 'Trail'], ['trail', 'Trail'],
  ['path', 'Path'], ['pth', 'Path'],
  ['walk', 'Walk'], ['wlk', 'Walk'],
  ['sq', 'Square'], ['square', 'Square'],
  ['loop', 'Loop'], ['lp', 'Loop'],
  ['bend', 'Bend'], ['bnd', 'Bend'],
  ['crk', 'Creek'], ['creek', 'Creek'],
  ['xing', 'Crossing'], ['crossing', 'Crossing'],
  ['pt', 'Point'], ['point', 'Point'],
  ['ridge', 'Ridge'], ['rdg', 'Ridge'],
  ['hill', 'Hill'], ['hl', 'Hill'],
  ['valley', 'Valley'], ['vly', 'Valley'],
  ['grove', 'Grove'], ['grv', 'Grove'],
  ['park', 'Park'], ['pk', 'Park'],
  ['gardens', 'Gardens'], ['gdns', 'Gardens'],
  ['heights', 'Heights'], ['hts', 'Heights'],
  ['meadows', 'Meadows'], ['mdws', 'Meadows'],
  ['woods', 'Woods'], ['wds', 'Woods']
]);

const DIRECTIONS = new Map([
  ['n', 'North'], ['no', 'North'], ['north', 'North'],
  ['s', 'South'], ['so', 'South'], ['south', 'South'],
  ['e', 'East'], ['ea', 'East'], ['east', 'East'],
  ['w', 'West'], ['we', 'West'], ['west', 'West'],
  ['ne', 'Northeast'], ['northeast', 'Northeast'],
  ['nw', 'Northwest'], ['northwest', 'Northwest'],
  ['se', 'Southeast'], ['southeast', 'Southeast'],
  ['sw', 'Southwest'], ['southwest', 'Southwest']
]);

const US_STATES = new Map([
  ['al', 'Alabama'], ['alabama', 'Alabama'],
  ['ak', 'Alaska'], ['alaska', 'Alaska'],
  ['az', 'Arizona'], ['arizona', 'Arizona'],
  ['ar', 'Arkansas'], ['arkansas', 'Arkansas'],
  ['ca', 'California'], ['california', 'California'],
  ['co', 'Colorado'], ['colorado', 'Colorado'],
  ['ct', 'Connecticut'], ['connecticut', 'Connecticut'],
  ['de', 'Delaware'], ['delaware', 'Delaware'],
  ['fl', 'Florida'], ['florida', 'Florida'],
  ['ga', 'Georgia'], ['georgia', 'Georgia'],
  ['hi', 'Hawaii'], ['hawaii', 'Hawaii'],
  ['id', 'Idaho'], ['idaho', 'Idaho'],
  ['il', 'Illinois'], ['illinois', 'Illinois'],
  ['in', 'Indiana'], ['indiana', 'Indiana'],
  ['ia', 'Iowa'], ['iowa', 'Iowa'],
  ['ks', 'Kansas'], ['kansas', 'Kansas'],
  ['ky', 'Kentucky'], ['kentucky', 'Kentucky'],
  ['la', 'Louisiana'], ['louisiana', 'Louisiana'],
  ['me', 'Maine'], ['maine', 'Maine'],
  ['md', 'Maryland'], ['maryland', 'Maryland'],
  ['ma', 'Massachusetts'], ['massachusetts', 'Massachusetts'],
  ['mi', 'Michigan'], ['michigan', 'Michigan'],
  ['mn', 'Minnesota'], ['minnesota', 'Minnesota'],
  ['ms', 'Mississippi'], ['mississippi', 'Mississippi'],
  ['mo', 'Missouri'], ['missouri', 'Missouri'],
  ['mt', 'Montana'], ['montana', 'Montana'],
  ['ne', 'Nebraska'], ['nebraska', 'Nebraska'],
  ['nv', 'Nevada'], ['nevada', 'Nevada'],
  ['nh', 'New Hampshire'], ['new hampshire', 'New Hampshire'],
  ['nj', 'New Jersey'], ['new jersey', 'New Jersey'],
  ['nm', 'New Mexico'], ['new mexico', 'New Mexico'],
  ['ny', 'New York'], ['new york', 'New York'],
  ['nc', 'North Carolina'], ['north carolina', 'North Carolina'],
  ['nd', 'North Dakota'], ['north dakota', 'North Dakota'],
  ['oh', 'Ohio'], ['ohio', 'Ohio'],
  ['ok', 'Oklahoma'], ['oklahoma', 'Oklahoma'],
  ['or', 'Oregon'], ['oregon', 'Oregon'],
  ['pa', 'Pennsylvania'], ['pennsylvania', 'Pennsylvania'],
  ['ri', 'Rhode Island'], ['rhode island', 'Rhode Island'],
  ['sc', 'South Carolina'], ['south carolina', 'South Carolina'],
  ['sd', 'South Dakota'], ['south dakota', 'South Dakota'],
  ['tn', 'Tennessee'], ['tennessee', 'Tennessee'],
  ['tx', 'Texas'], ['texas', 'Texas'],
  ['ut', 'Utah'], ['utah', 'Utah'],
  ['vt', 'Vermont'], ['vermont', 'Vermont'],
  ['va', 'Virginia'], ['virginia', 'Virginia'],
  ['wa', 'Washington'], ['washington', 'Washington'],
  ['wv', 'West Virginia'], ['west virginia', 'West Virginia'],
  ['wi', 'Wisconsin'], ['wisconsin', 'Wisconsin'],
  ['wy', 'Wyoming'], ['wyoming', 'Wyoming'],
  ['dc', 'District of Columbia'], ['district of columbia', 'District of Columbia']
]);

const UNIT_TYPES = new Set([
  'apt', 'apartment', 'unit', 'ste', 'suite', 'floor', 'fl', 'room', 'rm',
  'bldg', 'building', 'lot', 'space', 'spc', 'trailer', 'trlr'
]);

export class AddressNormalizer {
  private options: Required<AddressNormalizationOptions>;

  constructor(options: AddressNormalizationOptions = {}) {
    this.options = {
      standardizeStreetTypes: true,
      standardizeDirections: true,
      standardizeStates: true,
      removeExtraSpaces: true,
      normalizeCase: true,
      expandAbbreviations: true,
      ...options
    };
  }

  normalize(address: string): NormalizedAddress {
    const original = address.trim();
    if (!original) {
      return {
        normalized: '',
        original,
        confidence: 0,
        components: {},
        variations: []
      };
    }

    let normalized = original;
    const variations: string[] = [];

    if (this.options.removeExtraSpaces) {
      normalized = normalized.replace(/\s+/g, ' ');
    }

    if (this.options.normalizeCase) {
      normalized = this.normalizeCase(normalized);
    }

    const components = this.parseAddressComponents(normalized);
    const assembledAddress = this.assembleAddress(components);

    if (assembledAddress !== normalized) {
      variations.push(assembledAddress);
    }

    this.generateVariations(components, variations);

    const confidence = this.calculateConfidence(original, assembledAddress, components);

    return {
      normalized: assembledAddress,
      original,
      confidence,
      components,
      variations: [...new Set(variations)]
    };
  }

  private normalizeCase(address: string): string {
    return address.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  private parseAddressComponents(address: string): NormalizedAddress['components'] {
    const components: NormalizedAddress['components'] = {};

    const postalCodeMatch = address.match(/\b(\d{5}(?:-\d{4})?)\b/);
    if (postalCodeMatch) {
      components.postalCode = postalCodeMatch[1];
      address = address.replace(postalCodeMatch[0], '').trim();
    }

    const stateMatch = address.match(/\b([A-Za-z]{2}|[A-Za-z\s]+)\s*$/);
    if (stateMatch && this.options.standardizeStates) {
      const stateCandidate = stateMatch[1].toLowerCase().trim();
      const standardState = US_STATES.get(stateCandidate);
      if (standardState) {
        components.state = standardState;
        address = address.replace(stateMatch[0], '').trim();
      }
    }

    const parts = address.split(',').map(part => part.trim());

    if (parts.length >= 2) {
      components.city = parts[parts.length - 1];
      const streetPart = parts.slice(0, -1).join(', ');
      this.parseStreetAddress(streetPart, components);
    } else {
      this.parseStreetAddress(address, components);
    }

    return components;
  }

  private parseStreetAddress(street: string, components: NormalizedAddress['components']): void {
    const unitMatch = street.match(/\b(apt|apartment|unit|ste|suite|floor|fl|room|rm|bldg|building|lot|space|spc|trailer|trlr)\.?\s*([a-z0-9-]+)\b/i);
    if (unitMatch) {
      components.unit = `${unitMatch[1].charAt(0).toUpperCase() + unitMatch[1].slice(1)} ${unitMatch[2]}`;
      street = street.replace(unitMatch[0], '').trim();
    }

    const numberMatch = street.match(/^(\d+[a-z]?)\s+/);
    if (numberMatch) {
      components.streetNumber = numberMatch[1];
      street = street.replace(numberMatch[0], '').trim();
    }

    const streetParts = street.split(/\s+/);
    if (streetParts.length > 0) {
      const lastPart = streetParts[streetParts.length - 1].toLowerCase().replace(/\./g, '');

      if (this.options.standardizeStreetTypes && STREET_TYPES.has(lastPart)) {
        components.streetType = STREET_TYPES.get(lastPart);
        components.streetName = streetParts.slice(0, -1).join(' ');
      } else {
        components.streetName = streetParts.join(' ');
      }

      if (this.options.standardizeDirections) {
        this.normalizeDirections(components);
      }
    }
  }

  private normalizeDirections(components: NormalizedAddress['components']): void {
    if (components.streetName) {
      const words = components.streetName.split(/\s+/);
      const normalizedWords = words.map(word => {
        const lower = word.toLowerCase().replace(/\./g, '');
        return DIRECTIONS.get(lower) || word;
      });
      components.streetName = normalizedWords.join(' ');
    }
  }

  private assembleAddress(components: NormalizedAddress['components']): string {
    const parts: string[] = [];

    if (components.streetNumber) {
      parts.push(components.streetNumber);
    }

    if (components.streetName) {
      parts.push(components.streetName);
    }

    if (components.streetType) {
      parts.push(components.streetType);
    }

    if (components.unit) {
      parts.push(components.unit);
    }

    const streetAddress = parts.join(' ');
    const addressParts: string[] = [];

    if (streetAddress) {
      addressParts.push(streetAddress);
    }

    if (components.city) {
      addressParts.push(components.city);
    }

    if (components.state) {
      addressParts.push(components.state);
    }

    if (components.postalCode) {
      addressParts.push(components.postalCode);
    }

    return addressParts.join(', ');
  }

  private generateVariations(components: NormalizedAddress['components'], variations: string[]): void {
    const { streetNumber, streetName, streetType, unit, city, state, postalCode } = components;

    if (streetNumber && streetName) {
      if (streetType) {
        const shortType = this.getShortStreetType(streetType);
        if (shortType !== streetType) {
          const shortAddress = `${streetNumber} ${streetName} ${shortType}`;
          if (city) variations.push(`${shortAddress}, ${city}`);
          if (city && state) variations.push(`${shortAddress}, ${city}, ${state}`);
        }
      }

      if (!unit) {
        const baseAddress = [streetNumber, streetName, streetType].filter(Boolean).join(' ');
        variations.push(baseAddress);
        if (city) variations.push(`${baseAddress}, ${city}`);
      }
    }

    if (state && this.options.standardizeStates) {
      const stateAbbrev = this.getStateAbbreviation(state);
      if (stateAbbrev !== state) {
        const parts = [city, stateAbbrev, postalCode].filter(Boolean);
        if (parts.length > 0) {
          variations.push(parts.join(', '));
        }
      }
    }
  }

  private getShortStreetType(streetType: string): string {
    for (const [abbrev, full] of STREET_TYPES.entries()) {
      if (full === streetType) {
        return abbrev.charAt(0).toUpperCase() + abbrev.slice(1);
      }
    }
    return streetType;
  }

  private getStateAbbreviation(state: string): string {
    for (const [abbrev, full] of US_STATES.entries()) {
      if (full === state) {
        return abbrev.toUpperCase();
      }
    }
    return state;
  }

  private calculateConfidence(
    original: string,
    normalized: string,
    components: NormalizedAddress['components']
  ): number {
    if (original === normalized) return 1.0;

    let confidence = 0.8;

    const componentCount = Object.keys(components).filter(key => components[key as keyof typeof components]).length;

    if (componentCount >= 4) {
      confidence += 0.15;
    } else if (componentCount >= 2) {
      confidence += 0.1;
    }

    if (components.streetNumber && components.streetName) {
      confidence += 0.1;
    }

    if (components.city && components.state) {
      confidence += 0.1;
    }

    if (components.postalCode) {
      confidence += 0.05;
    }

    const lengthDifference = Math.abs(original.length - normalized.length);
    confidence -= (lengthDifference / original.length) * 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  getShortForm(components: NormalizedAddress['components']): string {
    const parts: string[] = [];

    if (components.streetNumber && components.streetName) {
      const streetType = components.streetType ? this.getShortStreetType(components.streetType) : '';
      parts.push([components.streetNumber, components.streetName, streetType].filter(Boolean).join(' '));
    }

    if (components.city) {
      parts.push(components.city);
    }

    if (components.state) {
      const stateAbbrev = this.getStateAbbreviation(components.state);
      parts.push(stateAbbrev);
    }

    if (components.postalCode) {
      parts.push(components.postalCode);
    }

    return parts.join(', ');
  }
}

export function normalizeAddress(address: string, options?: AddressNormalizationOptions): NormalizedAddress {
  const normalizer = new AddressNormalizer(options);
  return normalizer.normalize(address);
}