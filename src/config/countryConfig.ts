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
  currency: string;
  currencySymbol: string;
  taxName: string; // GST, VAT, etc.
  taxFields: TaxField[];
  registrationTypes: Array<{ value: string; label: string }>;
  otherStatutoryFields?: TaxField[];
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IN: {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    taxName: 'GST',
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
    currency: 'AED',
    currencySymbol: 'د.إ',
    taxName: 'VAT',
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
    currency: 'USD',
    currencySymbol: '$',
    taxName: 'Tax ID',
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
    currency: 'GBP',
    currencySymbol: '£',
    taxName: 'VAT',
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
};

export const COUNTRY_LIST = Object.values(COUNTRY_CONFIGS).map((config) => ({
  code: config.code,
  name: config.name,
}));

export function getCountryConfig(countryCode: string): CountryConfig {
  return COUNTRY_CONFIGS[countryCode] || COUNTRY_CONFIGS.IN; // Default to India
}

export function getTaxFieldName(countryCode: string): string {
  return getCountryConfig(countryCode).taxName;
}

export function getCurrencySymbol(countryCode: string): string {
  return getCountryConfig(countryCode).currencySymbol;
}
