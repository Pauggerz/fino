import { Model, Query } from '@nozbe/watermelondb';
import { field, text, date, children, readonly, lazy } from '@nozbe/watermelondb/decorators';
import { Q } from '@nozbe/watermelondb';
import type Transaction from './Transaction';

export default class Account extends Model {
  static table = 'accounts';

  static associations = {
    transactions: { type: 'has_many' as const, foreignKey: 'account_id' },
  };

  @text('user_id') userId!: string;
  @text('name') name!: string;
  @text('type') type!: string;
  @text('brand_colour') brandColour!: string;
  @text('letter_avatar') letterAvatar!: string;
  @field('balance') balance!: number;
  @field('starting_balance') startingBalance!: number;
  @field('is_active') isActive!: boolean;
  @field('is_deletable') isDeletable!: boolean;
  @field('sort_order') sortOrder!: number;
  @text('last_reconciled_at') lastReconciledAt?: string;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;

  @children('transactions') transactions!: Query<Transaction>;

  @lazy activeTransactions = this.collections
    .get<Transaction>('transactions')
    .query(
      Q.where('user_id', this.userId),
      Q.where('account_id', this.id),
      Q.where('account_deleted', false),
    );
}
