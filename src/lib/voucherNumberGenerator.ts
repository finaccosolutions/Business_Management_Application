// src/lib/voucherNumberGenerator.ts

export interface VoucherNumberConfig {
  prefix: string;
  suffix: string;
  width: number;
  prefixZero: boolean;
  startingNumber: number;
}

export type VoucherType = 'invoice' | 'payment' | 'receipt' | 'journal' | 'contra' | 'credit_note' | 'debit_note';

export function generateVoucherNumber(
  voucherType: VoucherType,
  currentCount: number,
  config: VoucherNumberConfig
): string {
  const { prefix, suffix, width, prefixZero, startingNumber } = config;

  const actualNumber = startingNumber + currentCount - 1;

  let numberPart: string;
  if (prefixZero) {
    numberPart = actualNumber.toString().padStart(width, '0');
  } else {
    numberPart = actualNumber.toString();
  }

  const suffixPart = suffix ? suffix : '';

  return `${prefix}-${numberPart}${suffixPart}`;
}

export function getVoucherConfig(
  voucherType: VoucherType,
  settings: any
): VoucherNumberConfig {
  const typeMap = {
    invoice: {
      prefix: settings.invoice_prefix || 'INV',
      suffix: settings.invoice_suffix || '',
      width: settings.invoice_number_width || 6,
      prefixZero: settings.invoice_number_prefix_zero !== false,
      startingNumber: settings.invoice_starting_number || 1,
    },
    payment: {
      prefix: settings.payment_prefix || 'PAY',
      suffix: settings.payment_suffix || '',
      width: settings.payment_number_width || 6,
      prefixZero: settings.payment_number_prefix_zero !== false,
      startingNumber: settings.payment_starting_number || 1,
    },
    receipt: {
      prefix: settings.receipt_prefix || 'RCT',
      suffix: settings.receipt_suffix || '',
      width: settings.receipt_number_width || 6,
      prefixZero: settings.receipt_number_prefix_zero !== false,
      startingNumber: settings.receipt_starting_number || 1,
    },
    journal: {
      prefix: settings.journal_prefix || 'JV',
      suffix: settings.journal_suffix || '',
      width: settings.journal_number_width || 6,
      prefixZero: settings.journal_number_prefix_zero !== false,
      startingNumber: settings.journal_starting_number || 1,
    },
    contra: {
      prefix: settings.contra_prefix || 'CNT',
      suffix: settings.contra_suffix || '',
      width: settings.contra_number_width || 6,
      prefixZero: settings.contra_number_prefix_zero !== false,
      startingNumber: settings.contra_starting_number || 1,
    },
    credit_note: {
      prefix: settings.credit_note_prefix || 'CN',
      suffix: settings.credit_note_suffix || '',
      width: settings.credit_note_number_width || 6,
      prefixZero: settings.credit_note_number_prefix_zero !== false,
      startingNumber: settings.credit_note_starting_number || 1,
    },
    debit_note: {
      prefix: settings.debit_note_prefix || 'DN',
      suffix: settings.debit_note_suffix || '',
      width: settings.debit_note_number_width || 6,
      prefixZero: settings.debit_note_number_prefix_zero !== false,
      startingNumber: settings.debit_note_starting_number || 1,
    },
  };

  return typeMap[voucherType];
}

export async function getNextVoucherNumber(
  supabase: any,
  userId: string,
  voucherType: VoucherType,
  tableName: string
): Promise<string> {
  const { data: settings, error: settingsError } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (settingsError) throw settingsError;
  if (!settings) throw new Error('Company settings not found');

  const { count, error: countError } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) throw countError;

  const currentCount = (count || 0) + 1;
  const config = getVoucherConfig(voucherType, settings);

  return generateVoucherNumber(voucherType, currentCount, config);
}

export function previewVoucherNumber(
  voucherType: VoucherType,
  settings: any,
  exampleCount: number = 1
): string {
  const config = getVoucherConfig(voucherType, settings);
  return generateVoucherNumber(voucherType, exampleCount, config);
}
