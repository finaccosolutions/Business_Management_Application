import { supabase } from './supabase';

export type VoucherTypeKey = 'payment' | 'receipt' | 'journal' | 'contra' | 'credit_note' | 'debit_note';

export async function generateNextVoucherNumber(
  userId: string,
  voucherTypeId: string,
  voucherTypeKey: VoucherTypeKey
): Promise<string> {
  try {
    const { data: settings } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { count } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('voucher_type_id', voucherTypeId);

    const currentCount = (count || 0) + 1;

    const settingsMap = {
      payment: {
        prefix: settings?.payment_prefix || 'PAY',
        suffix: settings?.payment_suffix || '',
        width: settings?.payment_number_width || 6,
        prefixZero: settings?.payment_number_prefix_zero !== false,
        startingNumber: settings?.payment_starting_number || 1,
      },
      receipt: {
        prefix: settings?.receipt_prefix || 'RCT',
        suffix: settings?.receipt_suffix || '',
        width: settings?.receipt_number_width || 6,
        prefixZero: settings?.receipt_number_prefix_zero !== false,
        startingNumber: settings?.receipt_starting_number || 1,
      },
      journal: {
        prefix: settings?.journal_prefix || 'JV',
        suffix: settings?.journal_suffix || '',
        width: settings?.journal_number_width || 6,
        prefixZero: settings?.journal_number_prefix_zero !== false,
        startingNumber: settings?.journal_starting_number || 1,
      },
      contra: {
        prefix: settings?.contra_prefix || 'CNT',
        suffix: settings?.contra_suffix || '',
        width: settings?.contra_number_width || 6,
        prefixZero: settings?.contra_number_prefix_zero !== false,
        startingNumber: settings?.contra_starting_number || 1,
      },
      credit_note: {
        prefix: settings?.credit_note_prefix || 'CN',
        suffix: settings?.credit_note_suffix || '',
        width: settings?.credit_note_number_width || 6,
        prefixZero: settings?.credit_note_number_prefix_zero !== false,
        startingNumber: settings?.credit_note_starting_number || 1,
      },
      debit_note: {
        prefix: settings?.debit_note_prefix || 'DN',
        suffix: settings?.debit_note_suffix || '',
        width: settings?.debit_note_number_width || 6,
        prefixZero: settings?.debit_note_number_prefix_zero !== false,
        startingNumber: settings?.debit_note_starting_number || 1,
      },
    };

    const config = settingsMap[voucherTypeKey];
    const actualNumber = config.startingNumber + currentCount - 1;

    let numberPart: string;
    if (config.prefixZero) {
      numberPart = actualNumber.toString().padStart(config.width, '0');
    } else {
      numberPart = actualNumber.toString();
    }

    return `${config.prefix}-${numberPart}${config.suffix}`;
  } catch (error) {
    console.error('Error generating voucher number:', error);
    return 'ERROR-000001';
  }
}
