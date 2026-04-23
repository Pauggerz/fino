import { Model, Relation } from '@nozbe/watermelondb';
import { field, text, date, relation } from '@nozbe/watermelondb/decorators';
import type Account from './Account';

export default class Transaction extends Model {
  static table = 'transactions';

  static associations = {
    accounts: { type: 'belongs_to' as const, key: 'account_id' },
  };

  @text('user_id') userId!: string;
  @text('account_id') accountId!: string;
  @field('amount') amount!: number;
  @text('type') type!: string;
  @text('category') category?: string;
  @text('merchant_name') merchantName?: string;
  @text('display_name') displayName?: string;
  @text('transaction_note') transactionNote?: string;
  @text('signal_source') signalSource?: string;
  @text('date') date!: string;
  @text('receipt_url') receiptUrl?: string;
  @field('account_deleted') accountDeleted!: boolean;
  @field('is_transfer') isTransfer!: boolean;
  @field('merchant_confidence') merchantConfidence?: number;
  @field('amount_confidence') amountConfidence?: number;
  @field('date_confidence') dateConfidence?: number;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;

  @relation('accounts', 'account_id') account!: Relation<Account>;
}
