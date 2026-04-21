import { Model } from '@nozbe/watermelondb';
import { text, date } from '@nozbe/watermelondb/decorators';

export default class MerchantMapping extends Model {
  static table = 'merchant_mappings';

  @text('user_id') userId!: string;
  @text('merchant_raw') merchantRaw!: string;
  @text('category') category!: string;
  @text('server_created_at') serverCreatedAt?: string;
  @date('updated_at') updatedAt!: Date;
}
