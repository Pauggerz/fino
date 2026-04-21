import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class BillReminder extends Model {
  static table = 'bill_reminders';

  @text('user_id') userId!: string;
  @text('title') title!: string;
  @field('amount') amount?: number;
  @text('merchant_name') merchantName?: string;
  @text('due_date') dueDate!: string;
  @field('is_recurring') isRecurring!: boolean;
  @field('is_paid') isPaid!: boolean;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;
}
