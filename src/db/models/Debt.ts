import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class Debt extends Model {
  static table = 'debts';

  @text('user_id') userId!: string;

  @text('debtor_name') debtorName!: string;

  @text('description') description?: string;

  @field('total_amount') totalAmount!: number;

  @field('amount_paid') amountPaid!: number;

  // 'owed_to_me' (receivable) | 'i_owe' (payable). May be undefined on rows
  // created before the direction migration — treat undefined as 'owed_to_me'.
  @text('direction') direction?: string;

  @text('due_date') dueDate?: string;

  @text('server_created_at') serverCreatedAt?: string;

  @date('updated_at') updatedAt!: Date;
}
