// src/config/countryConfig.ts
export interface TaxField {
  name: string;
  label: string;
  placeholder: string;
  pattern?: string;
  maxLength?: number;
  required?: boolean;
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
  currency: string;
  currencySymbol: string;
  taxName: string;
  taxFields: TaxField[];
  registrationTypes: Array<{ value: string; label: string }>;
  otherStatutoryFields?: TaxField[];
  dateFormat: string;
  numberFormat: {
    decimal: string;
    thousands: string;
  };
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IN: {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    phoneCode: '+91',
    currency: 'INR',
    currencySymbol: '₹',
    taxName: 'GST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'gstin',
        label: 'GSTIN',
        placeholder: '22AAAAA0000A1Z5',
        pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
        maxLength: 15,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'GST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
      { value: 'composition', label: 'Composition Scheme' },
    ],
    otherStatutoryFields: [
      {
        name: 'pan_number',
        label: 'PAN Number',
        placeholder: 'AAAAA0000A',
        pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
        maxLength: 10,
      },
      {
        name: 'tan_number',
        label: 'TAN Number',
        placeholder: 'AAAA00000A',
        pattern: '^[A-Z]{4}[0-9]{5}[A-Z]{1}$',
        maxLength: 10,
      },
      {
        name: 'msme_number',
        label: 'MSME/Udyam Number',
        placeholder: 'UDYAM-XX-00-0000000',
      },
    ],
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    phoneCode: '+971',
    currency: 'AED',
    currencySymbol: 'د.إ',
    taxName: 'VAT',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'vat_number',
        label: 'VAT Registration Number',
        placeholder: '100000000000003',
        maxLength: 15,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'VAT Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'trade_license',
        label: 'Trade License Number',
        placeholder: 'Enter trade license number',
      },
    ],
  },
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    phoneCode: '+1',
    currency: 'USD',
    currencySymbol: '$',
    taxName: 'Tax ID',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'ein',
        label: 'EIN (Employer Identification Number)',
        placeholder: '12-3456789',
        pattern: '^[0-9]{2}-[0-9]{7}$',
        maxLength: 10,
      },
    ],
    registrationTypes: [
      { value: 'business', label: 'Business Entity' },
      { value: 'individual', label: 'Individual/Sole Proprietor' },
    ],
    otherStatutoryFields: [
      {
        name: 'ssn',
        label: 'SSN (for individuals)',
        placeholder: '123-45-6789',
        pattern: '^[0-9]{3}-[0-9]{2}-[0-9]{4}$',
        maxLength: 11,
      },
    ],
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    phoneCode: '+44',
    currency: 'GBP',
    currencySymbol: '£',
    taxName: 'VAT',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'vat_number',
        label: 'VAT Registration Number',
        placeholder: 'GB123456789',
        pattern: '^GB[0-9]{9}$',
        maxLength: 11,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'VAT Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'company_number',
        label: 'Company Registration Number',
        placeholder: '12345678',
      },
    ],
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    phoneCode: '+1',
    currency: 'CAD',
    currencySymbol: '$',
    taxName: 'GST/HST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'gst_number',
        label: 'GST/HST Number',
        placeholder: '123456789RT0001',
        maxLength: 15,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'GST/HST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'business_number',
        label: 'Business Number',
        placeholder: '123456789',
      },
    ],
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    phoneCode: '+61',
    currency: 'AUD',
    currencySymbol: '$',
    taxName: 'GST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'abn',
        label: 'ABN (Australian Business Number)',
        placeholder: '12 345 678 901',
        maxLength: 14,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'GST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'acn',
        label: 'ACN (Australian Company Number)',
        placeholder: '123 456 789',
      },
    ],
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    flag: '🇸🇬',
    phoneCode: '+65',
    currency: 'SGD',
    currencySymbol: '$',
    taxName: 'GST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'gst_number',
        label: 'GST Registration Number',
        placeholder: 'M12345678X',
        maxLength: 10,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'GST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'uen',
        label: 'UEN (Unique Entity Number)',
        placeholder: '123456789A',
      },
    ],
  },
  MY: {
    code: 'MY',
    name: 'Malaysia',
    flag: '🇲🇾',
    phoneCode: '+60',
    currency: 'MYR',
    currencySymbol: 'RM',
    taxName: 'SST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'sst_number',
        label: 'SST Registration Number',
        placeholder: 'A01-2345-67890123',
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'SST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'business_number',
        label: 'Business Registration Number',
        placeholder: '123456-X',
      },
    ],
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    flag: '🇳🇿',
    phoneCode: '+64',
    currency: 'NZD',
    currencySymbol: '$',
    taxName: 'GST',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: '.',
      thousands: ',',
    },
    taxFields: [
      {
        name: 'gst_number',
        label: 'GST Number',
        placeholder: '123-456-789',
        maxLength: 11,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'GST Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'nzbn',
        label: 'NZBN (New Zealand Business Number)',
        placeholder: '1234567890123',
      },
    ],
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    flag: '🇩🇪',
    phoneCode: '+49',
    currency: 'EUR',
    currencySymbol: '€',
    taxName: 'VAT',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: {
      decimal: ',',
      thousands: '.',
    },
    taxFields: [
      {
        name: 'vat_number',
        label: 'VAT ID (Umsatzsteuer-ID)',
        placeholder: 'DE123456789',
        pattern: '^DE[0-9]{9}$',
        maxLength: 11,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'VAT Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'tax_number',
        label: 'Tax Number (Steuernummer)',
        placeholder: '12/345/67890',
      },
    ],
  },
  FR: {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    phoneCode: '+33',
    currency: 'EUR',
    currencySymbol: '€',
    taxName: 'VAT',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: {
      decimal: ',',
      thousands: ' ',
    },
    taxFields: [
      {
        name: 'vat_number',
        label: 'VAT Number (Numéro de TVA)',
        placeholder: 'FR12345678901',
        pattern: '^FR[0-9]{11}$',
        maxLength: 13,
      },
    ],
    registrationTypes: [
      { value: 'registered', label: 'VAT Registered' },
      { value: 'unregistered', label: 'Unregistered' },
    ],
    otherStatutoryFields: [
      {
        name: 'siret',
        label: 'SIRET Number',
        placeholder: '12345678901234',
      },
    ],
  },
};

export const COUNTRY_LIST = Object.values(COUNTRY_CONFIGS).map((config) => ({
  code: config.code,
  name: config.name,
  flag: config.flag,
  phoneCode: config.phoneCode,
}));

export function getCountryConfig(countryCode: string): CountryConfig {
  return COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.IN;
}

export function getTaxFieldName(countryCode: string): string {
  return getCountryConfig(countryCode).taxName;
}

export function getCurrencySymbol(countryCode: string): string {
  return getCountryConfig(countryCode).currencySymbol;
}

export function getPhoneCode(countryCode: string): string {
  return getCountryConfig(countryCode).phoneCode;
}

export function getCountryFlag(countryCode: string): string {
  return getCountryConfig(countryCode).flag;
}

export function getDateFormat(countryCode: string): string {
  return getCountryConfig(countryCode).dateFormat;
}

export function getNumberFormat(countryCode: string) {
  return getCountryConfig(countryCode).numberFormat;
}
