import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class SavingsGoal extends Model {
  static table = 'savings_goals';

  @text('user_id') userId!: string;
  @text('name') name!: string;
  @text('description') description?: string;
  @field('target_amount') targetAmount!: number;
  @field('current_amount') currentAmount!: number;
  @text('target_date') targetDate?: string;
  @text('icon') icon!: string;
  @text('color') color!: string;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;
}
