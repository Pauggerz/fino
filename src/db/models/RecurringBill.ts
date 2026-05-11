import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class RecurringBill extends Model {
  static table = 'recurring_bills';

  @text('user_id') userId!: string;
  @text('title') title!: string;
  @field('amount') amount!: number;
  @text('account_id') accountId?: string;
  @text('category') category?: string;
  @text('cadence') cadence!: 'daily' | 'weekly' | 'monthly' | 'yearly';
  @text('anchor_date') anchorDate!: string;
  @text('next_due_at') nextDueAt!: string;
  @field('is_active') isActive!: boolean;
  @text('last_paid_at') lastPaidAt?: string;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;
}
