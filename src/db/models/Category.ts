import { Model } from '@nozbe/watermelondb';
import { field, text, date } from '@nozbe/watermelondb/decorators';

export default class Category extends Model {
  static table = 'categories';

  @text('user_id') userId!: string;
  @text('name') name!: string;
  @text('emoji') emoji?: string;
  @text('tile_bg_colour') tileBgColour?: string;
  @text('text_colour') textColour?: string;
  @field('budget_limit') budgetLimit?: number;
  @field('is_active') isActive!: boolean;
  @field('is_default') isDefault!: boolean;
  @field('sort_order') sortOrder!: number;
  @date('updated_at') updatedAt!: Date;
}
