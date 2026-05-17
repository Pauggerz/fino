// Lightweight in-house i18n. No i18next dependency — translations are flat
// string maps with `{var}` placeholders. Add languages by mirroring the `en`
// shape; missing keys fall back to English so partial translations work.

export type LanguageCode = 'en' | 'fil' | 'es';

export interface LanguageMeta {
  code: LanguageCode;
  name: string;
  native: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'fil', name: 'Filipino', native: 'Filipino', flag: '🇵🇭' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
];

const en = {
  // Settings shell
  'settings.title': 'Settings',
  'settings.search': 'Search settings',
  'settings.section.account': 'Account',
  'settings.section.appearance': 'Appearance',
  'settings.section.notifications': 'Notifications',
  'settings.section.currency': 'Currency & Region',
  'settings.section.language': 'Language',
  'settings.section.privacy': 'Privacy & Security',
  'settings.section.about': 'About',

  // Account
  'settings.account.edit': 'Edit profile',
  'settings.account.editSub': 'Name, avatar',
  'settings.account.email': 'Change email',
  'settings.account.password': 'Change password',
  'settings.account.biometric': 'Biometric lock',
  'settings.account.biometricSub': 'Require Face ID to open Fino',
  'settings.account.signOut': 'Sign out',
  'settings.account.delete': 'Delete account',
  'settings.account.deleteSub': 'Permanently erase your Fino data',

  // Appearance
  'settings.appearance.theme': 'Theme',
  'settings.appearance.themeSub': 'Match the system or pick yours',
  'settings.appearance.system': 'System',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.appearance.accent': 'Accent color',
  'settings.appearance.accentSub': 'Adapts every screen, with safe contrast',
  'settings.appearance.preview': 'Live preview',
  'settings.appearance.totalBalance': 'Total balance',

  // Notifications
  'settings.notifications.push': 'Push notifications',
  'settings.notifications.pushSub': 'Allow Fino to send you alerts',
  'settings.notifications.bills': 'Bill reminders',
  'settings.notifications.billsSub': '{when} · {time}',
  'settings.notifications.budget': 'Budget alerts',
  'settings.notifications.budgetSub': 'At {threshold} of category budget',
  'settings.notifications.weekly': 'Weekly insight digest',
  'settings.notifications.weeklySub': '{day} · {time}',
  'settings.notifications.quiet': 'Quiet hours',
  'settings.notifications.inactivity': 'Inactivity reminder',
  'settings.notifications.inactivitySub': "Nudge me if I forget to log spends",
  'settings.notifications.goals': 'Goal milestones',

  // Currency
  'settings.currency.primary': 'Primary currency',
  'settings.currency.primarySub': 'All amounts shown in this currency',
  'settings.currency.numberFormat': 'Number format',
  'settings.currency.numberFormatSub': 'Decimal & thousands separator',
  'settings.currency.firstDay': 'First day of week',
  'settings.currency.privacyMode': 'Hide amounts',
  'settings.currency.privacyModeSub': 'Privacy mode replaces values with ●●●',

  // Language
  'settings.language.app': 'App language',
  'settings.language.help': 'Help translate Fino',
  'settings.language.helpSub': 'Contribute on Crowdin',

  // About
  'settings.about.version': 'Version',
  'settings.about.whatsNew': "What's new",
  'settings.about.feedback': 'Send feedback',

  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.back': 'Back',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.on': 'On',
  'common.off': 'Off',

  // Toasts / alerts
  'alert.signOut.title': 'Sign out',
  'alert.signOut.body': 'You can sign back in anytime.',
  'alert.delete.title': 'Delete your account?',
  'alert.delete.body': 'This permanently erases all your data. This cannot be undone.',
};

const fil: Partial<typeof en> = {
  'settings.title': 'Mga Setting',
  'settings.search': 'Maghanap ng setting',
  'settings.section.account': 'Account',
  'settings.section.appearance': 'Hitsura',
  'settings.section.notifications': 'Mga Abiso',
  'settings.section.currency': 'Pera at Rehiyon',
  'settings.section.language': 'Wika',
  'settings.section.privacy': 'Privacy at Seguridad',
  'settings.section.about': 'Tungkol',
  'settings.account.edit': 'I-edit ang profile',
  'settings.account.signOut': 'Mag-sign out',
  'settings.account.delete': 'Tanggalin ang account',
  'settings.appearance.theme': 'Tema',
  'settings.appearance.system': 'System',
  'settings.appearance.light': 'Maliwanag',
  'settings.appearance.dark': 'Madilim',
  'settings.appearance.accent': 'Kulay ng tema',
  'settings.appearance.preview': 'Live na preview',
  'settings.appearance.totalBalance': 'Kabuuang balanse',
  'settings.notifications.push': 'Mga push notification',
  'settings.notifications.bills': 'Paalala sa bayarin',
  'settings.notifications.budget': 'Mga abiso ng badyet',
  'settings.currency.primary': 'Pangunahing pera',
  'settings.language.app': 'Wika ng app',
  'common.save': 'I-save',
  'common.cancel': 'Kanselahin',
  'common.done': 'Tapos',
  'common.back': 'Bumalik',
};

const es: Partial<typeof en> = {
  'settings.title': 'Ajustes',
  'settings.search': 'Buscar ajustes',
  'settings.section.account': 'Cuenta',
  'settings.section.appearance': 'Apariencia',
  'settings.section.notifications': 'Notificaciones',
  'settings.section.currency': 'Moneda y región',
  'settings.section.language': 'Idioma',
  'settings.section.privacy': 'Privacidad y seguridad',
  'settings.section.about': 'Acerca de',
  'settings.account.edit': 'Editar perfil',
  'settings.account.signOut': 'Cerrar sesión',
  'settings.account.delete': 'Eliminar cuenta',
  'settings.appearance.theme': 'Tema',
  'settings.appearance.system': 'Sistema',
  'settings.appearance.light': 'Claro',
  'settings.appearance.dark': 'Oscuro',
  'settings.appearance.accent': 'Color de acento',
  'settings.appearance.preview': 'Vista previa',
  'settings.appearance.totalBalance': 'Saldo total',
  'settings.notifications.push': 'Notificaciones push',
  'settings.currency.primary': 'Moneda principal',
  'settings.language.app': 'Idioma de la app',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.done': 'Listo',
  'common.back': 'Atrás',
};

export type TKey = keyof typeof en;

export const DICTIONARIES: Record<LanguageCode, Partial<typeof en>> = {
  en,
  fil,
  es,
};

export function translate(
  lang: LanguageCode,
  key: TKey,
  vars?: Record<string, string | number>
): string {
  const dict = DICTIONARIES[lang] || en;
  let str = (dict[key] as string | undefined) ?? en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
    }
  }
  return str;
}
