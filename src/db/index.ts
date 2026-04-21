import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import { modelClasses } from './models';

/**
 * Single shared WatermelonDB instance for the entire app.
 *
 * SQLiteAdapter is used over the LokiJS web adapter because Fino ships
 * as a native Expo app (android/ios projects exist). `jsi` is left off so
 * we stay on the portable async bridge — safe across RN versions and
 * Hermes/JSC without any extra native-module linking beyond watermelondb
 * itself.
 */
const adapter = new SQLiteAdapter({
  schema,
  dbName: 'fino',
  onSetUpError: (error) => {
    // eslint-disable-next-line no-console
    console.error('WatermelonDB setup failed', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});

export default database;
