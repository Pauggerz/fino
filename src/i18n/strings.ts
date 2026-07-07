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
  'settings.notifications.inactivitySub': 'Nudge me if I forget to log spends',
  'settings.notifications.goals': 'Goal milestones',

  // Currency
  'settings.currency.primary': 'Primary currency',
  'settings.currency.primarySub': 'All amounts shown in this currency',
  'settings.currency.numberFormat': 'Number format',
  'settings.currency.numberFormatSub': 'Decimal & thousands separator',
  'settings.currency.firstDay': 'First day of week',
  'settings.currency.privacyMode': 'Hide amounts',
  'settings.currency.privacyModeSub': 'Privacy mode replaces values with ●●●',
  'settings.privacy.assist': 'Ask online when unsure',
  'settings.privacy.assistSub':
    'If Fino can’t understand a chat message, send just that sentence online to figure it out. Amounts and balances never leave your phone.',

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
  'alert.delete.body':
    'This permanently erases all your data. This cannot be undone.',

  // Account screen (detail)
  'account.profile': 'Profile',
  'account.displayName': 'Display name',
  'account.namePlaceholder': 'Your name',
  'account.saveName': 'Save name',
  'account.emailSection': 'Email',
  'account.emailLabel': 'Email address',
  'account.emailHelper':
    'You will receive a confirmation link at the new address.',
  'account.updateEmail': 'Update email',
  'account.passwordSection': 'Password',
  'account.newPassword': 'New password',
  'account.passwordPlaceholder': 'At least 8 characters',
  'account.changePassword': 'Change password',
  'account.dangerZone': 'Danger zone',
  'account.alert.nameRequired.title': 'Name required',
  'account.alert.nameRequired.body': 'Please enter a display name.',
  'account.alert.saveFailed': 'Save failed',
  'account.alert.saved.title': 'Saved',
  'account.alert.saved.body': 'Your display name has been updated.',
  'account.alert.invalidEmail.title': 'Invalid email',
  'account.alert.invalidEmail.body': 'Please enter a valid email address.',
  'account.alert.updateFailed': 'Update failed',
  'account.alert.confirmEmail.title': 'Confirm your new email',
  'account.alert.confirmEmail.body':
    'We sent a confirmation link to your new address. Your email will update after you confirm.',
  'account.alert.weakPassword.title': 'Weak password',
  'account.alert.weakPassword.body': 'Use at least 8 characters.',
  'account.alert.passwordChanged.title': 'Password changed',
  'account.alert.passwordChanged.body':
    'Use your new password next time you sign in.',
  'account.alert.deleteFailed.title': 'Delete failed',
  'account.alert.deleteFailed.body':
    "We couldn't delete your account. Please try again, or email support@fino.app.",
  'account.alert.biometric.title': 'Biometric lock',
  'account.alert.biometric.noHardware':
    "This device doesn't support biometric unlock.",
  'account.alert.biometric.notEnrolled':
    'Set up Face ID, fingerprint, or a device passcode first, then try again.',
  'account.alert.biometric.authFailed':
    'Authentication failed. App lock was not enabled.',

  // Notification screen (detail)
  'notif.section.reminders': 'Reminders',
  'notif.section.insights': 'Insights & goals',
  'notif.privacyHeader': 'Privacy',
  'notif.remindMe': 'Remind me',
  'notif.at': 'At',
  'notif.alertMeAt': 'Alert me at',
  'notif.payday': 'Payday reminders',
  'notif.paydaySub': 'A nudge on payday to log income when it lands.',
  'notif.day': 'Day',
  'notif.time': 'Time',
  'notif.hideLockscreen': 'Hide amounts on lockscreen',
  'notif.hideLockscreenSub':
    'Redact peso amounts in notifications until you unlock.',
  'notif.from': 'From',
  'notif.to': 'To',
  'notif.quietOn': 'No notifications during this window.',
  'notif.quietOff': 'Off',
  'notif.onTheDay': 'On the day',
  'notif.oneDayBefore': '1 day before',
  'notif.nDaysBefore': '{n} days before',
  'notif.thresholdOption': '{pct}% of budget',
  'notif.perm.granted.title': 'Notifications allowed',
  'notif.perm.granted.sub': 'Fino can send notifications to this device.',
  'notif.perm.denied.title': 'Notifications are off',
  'notif.perm.denied.sub': 'Blocked in system settings. Tap to open Settings.',
  'notif.perm.undetermined.title': 'Turn on notifications',
  'notif.perm.undetermined.sub':
    'Get bill reminders, budget alerts, and goal nudges.',
  'notif.perm.default.title': 'Notifications',
  'notif.perm.default.sub': 'Manage how Fino reaches you.',
  'notif.footer':
    "Notifications respect your device-level permissions for Fino. If push isn't working, check Settings → Notifications → Fino on your device.",
  'notif.sheet.reminderTime': 'Reminder time',
  'notif.sheet.threshold': 'Budget alert threshold',
  'notif.sheet.digestDay': 'Weekly digest day',
  'notif.sheet.digestTime': 'Weekly digest time',
  'notif.sheet.quietStart': 'Quiet hours start',
  'notif.sheet.quietEnd': 'Quiet hours end',

  // Currency screen (detail)
  'currency.searchPlaceholder': 'Search currencies',
  'currency.noMatch': 'No currencies match "{query}"',

  // Language screen (detail)
  'language.footer':
    'Translations are community-maintained. Missing strings fall back to English.',
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
  'settings.account.biometric': 'Biometric lock',
  'settings.account.biometricSub':
    'Kailanganin ang Face ID para buksan ang Fino',
  'settings.currency.privacyMode': 'Itago ang halaga',
  'settings.currency.privacyModeSub':
    'Pinapalitan ng privacy mode ang mga halaga ng ●●●',
  'settings.privacy.assist': 'Magtanong online kapag hindi sigurado',
  'settings.privacy.assistSub':
    'Kapag hindi maintindihan ni Fino ang chat mo, ipapadala online ang pangungusap na iyon lang. Hindi kailanman aalis sa telepono mo ang mga halaga at balanse.',
  'common.save': 'I-save',
  'common.cancel': 'Kanselahin',
  'common.done': 'Tapos',
  'common.back': 'Bumalik',
  'common.delete': 'Tanggalin',

  // Account screen (detail)
  'account.profile': 'Profile',
  'account.displayName': 'Pangalang ipapakita',
  'account.namePlaceholder': 'Pangalan mo',
  'account.saveName': 'I-save ang pangalan',
  'account.emailSection': 'Email',
  'account.emailLabel': 'Email address',
  'account.emailHelper':
    'Makakatanggap ka ng confirmation link sa bagong address.',
  'account.updateEmail': 'I-update ang email',
  'account.passwordSection': 'Password',
  'account.newPassword': 'Bagong password',
  'account.passwordPlaceholder': 'Hindi bababa sa 8 karakter',
  'account.changePassword': 'Palitan ang password',
  'account.dangerZone': 'Mapanganib na bahagi',
  'account.alert.nameRequired.title': 'Kailangan ng pangalan',
  'account.alert.nameRequired.body': 'Maglagay ng pangalang ipapakita.',
  'account.alert.saveFailed': 'Hindi na-save',
  'account.alert.saved.title': 'Na-save',
  'account.alert.saved.body': 'Na-update na ang pangalang ipinapakita mo.',
  'account.alert.invalidEmail.title': 'Hindi wastong email',
  'account.alert.invalidEmail.body': 'Maglagay ng wastong email address.',
  'account.alert.updateFailed': 'Hindi na-update',
  'account.alert.confirmEmail.title': 'Kumpirmahin ang bagong email',
  'account.alert.confirmEmail.body':
    'Nagpadala kami ng confirmation link sa bagong address mo. Mag-uupdate ang email pagkatapos mong kumpirmahin.',
  'account.alert.weakPassword.title': 'Mahinang password',
  'account.alert.weakPassword.body': 'Gumamit ng hindi bababa sa 8 karakter.',
  'account.alert.passwordChanged.title': 'Napalitan ang password',
  'account.alert.passwordChanged.body':
    'Gamitin ang bagong password sa susunod mong pag-sign in.',
  'account.alert.deleteFailed.title': 'Hindi natanggal',
  'account.alert.deleteFailed.body':
    'Hindi namin natanggal ang account mo. Subukan ulit, o mag-email sa support@fino.app.',
  'account.alert.biometric.title': 'Biometric lock',
  'account.alert.biometric.noHardware':
    'Hindi sinusuportahan ng device na ito ang biometric unlock.',
  'account.alert.biometric.notEnrolled':
    'Mag-set up muna ng Face ID, fingerprint, o device passcode, tapos subukan ulit.',
  'account.alert.biometric.authFailed':
    'Nabigo ang authentication. Hindi na-enable ang app lock.',

  // Notification screen (detail)
  'notif.section.reminders': 'Mga paalala',
  'notif.section.insights': 'Mga insight at layunin',
  'notif.privacyHeader': 'Privacy',
  'notif.remindMe': 'Paalalahanan ako',
  'notif.at': 'Sa oras na',
  'notif.alertMeAt': 'Abisuhan ako sa',
  'notif.payday': 'Paalala sa sahod',
  'notif.paydaySub':
    'Isang paalala sa araw ng sahod para itala ang kita pagdating nito.',
  'notif.day': 'Araw',
  'notif.time': 'Oras',
  'notif.hideLockscreen': 'Itago ang halaga sa lockscreen',
  'notif.hideLockscreenSub':
    'Itago ang mga halaga sa peso sa mga abiso hanggang i-unlock mo.',
  'notif.from': 'Mula',
  'notif.to': 'Hanggang',
  'notif.quietOn': 'Walang abiso sa loob ng window na ito.',
  'notif.quietOff': 'Naka-off',
  'notif.onTheDay': 'Sa mismong araw',
  'notif.oneDayBefore': '1 araw bago',
  'notif.nDaysBefore': '{n} araw bago',
  'notif.thresholdOption': '{pct}% ng badyet',
  'notif.perm.granted.title': 'Pinapayagan ang mga abiso',
  'notif.perm.granted.sub':
    'Maaaring magpadala ang Fino ng abiso sa device na ito.',
  'notif.perm.denied.title': 'Naka-off ang mga abiso',
  'notif.perm.denied.sub':
    'Naka-block sa system settings. I-tap para buksan ang Settings.',
  'notif.perm.undetermined.title': 'I-on ang mga abiso',
  'notif.perm.undetermined.sub':
    'Makatanggap ng paalala sa bayarin, abiso sa badyet, at paalala sa layunin.',
  'notif.perm.default.title': 'Mga abiso',
  'notif.perm.default.sub': 'Pamahalaan kung paano ka aabutin ng Fino.',
  'notif.footer':
    'Sumusunod ang mga abiso sa device-level na pahintulot para sa Fino. Kung hindi gumagana ang push, tingnan ang Settings → Notifications → Fino sa device mo.',
  'notif.sheet.reminderTime': 'Oras ng paalala',
  'notif.sheet.threshold': 'Threshold ng abiso sa badyet',
  'notif.sheet.digestDay': 'Araw ng lingguhang digest',
  'notif.sheet.digestTime': 'Oras ng lingguhang digest',
  'notif.sheet.quietStart': 'Simula ng quiet hours',
  'notif.sheet.quietEnd': 'Katapusan ng quiet hours',

  // Currency screen (detail)
  'currency.searchPlaceholder': 'Maghanap ng pera',
  'currency.noMatch': 'Walang pera na tumugma sa "{query}"',

  // Language screen (detail)
  'language.footer':
    'Ang mga pagsasalin ay pinapanatili ng komunidad. Ang mga kulang na string ay babalik sa Ingles.',
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
  'settings.account.biometric': 'Bloqueo biométrico',
  'settings.account.biometricSub': 'Requerir Face ID para abrir Fino',
  'settings.currency.privacyMode': 'Ocultar importes',
  'settings.currency.privacyModeSub':
    'El modo privado reemplaza los valores con ●●●',
  'settings.privacy.assist': 'Consultar en línea si hay dudas',
  'settings.privacy.assistSub':
    'Si Fino no entiende un mensaje del chat, envía solo esa frase en línea para interpretarla. Los importes y saldos nunca salen de tu teléfono.',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.done': 'Listo',
  'common.back': 'Atrás',
  'common.delete': 'Eliminar',

  // Account screen (detail)
  'account.profile': 'Perfil',
  'account.displayName': 'Nombre visible',
  'account.namePlaceholder': 'Tu nombre',
  'account.saveName': 'Guardar nombre',
  'account.emailSection': 'Correo',
  'account.emailLabel': 'Dirección de correo',
  'account.emailHelper':
    'Recibirás un enlace de confirmación en la nueva dirección.',
  'account.updateEmail': 'Actualizar correo',
  'account.passwordSection': 'Contraseña',
  'account.newPassword': 'Nueva contraseña',
  'account.passwordPlaceholder': 'Al menos 8 caracteres',
  'account.changePassword': 'Cambiar contraseña',
  'account.dangerZone': 'Zona de peligro',
  'account.alert.nameRequired.title': 'Nombre requerido',
  'account.alert.nameRequired.body': 'Ingresa un nombre visible.',
  'account.alert.saveFailed': 'Error al guardar',
  'account.alert.saved.title': 'Guardado',
  'account.alert.saved.body': 'Tu nombre visible se ha actualizado.',
  'account.alert.invalidEmail.title': 'Correo inválido',
  'account.alert.invalidEmail.body': 'Ingresa una dirección de correo válida.',
  'account.alert.updateFailed': 'Error al actualizar',
  'account.alert.confirmEmail.title': 'Confirma tu nuevo correo',
  'account.alert.confirmEmail.body':
    'Enviamos un enlace de confirmación a tu nueva dirección. Tu correo se actualizará después de confirmar.',
  'account.alert.weakPassword.title': 'Contraseña débil',
  'account.alert.weakPassword.body': 'Usa al menos 8 caracteres.',
  'account.alert.passwordChanged.title': 'Contraseña cambiada',
  'account.alert.passwordChanged.body':
    'Usa tu nueva contraseña la próxima vez que inicies sesión.',
  'account.alert.deleteFailed.title': 'Error al eliminar',
  'account.alert.deleteFailed.body':
    'No pudimos eliminar tu cuenta. Inténtalo de nuevo o escribe a support@fino.app.',
  'account.alert.biometric.title': 'Bloqueo biométrico',
  'account.alert.biometric.noHardware':
    'Este dispositivo no admite desbloqueo biométrico.',
  'account.alert.biometric.notEnrolled':
    'Configura primero Face ID, huella o un código de dispositivo, luego inténtalo de nuevo.',
  'account.alert.biometric.authFailed':
    'La autenticación falló. No se activó el bloqueo de la app.',

  // Notification screen (detail)
  'notif.section.reminders': 'Recordatorios',
  'notif.section.insights': 'Análisis y metas',
  'notif.privacyHeader': 'Privacidad',
  'notif.remindMe': 'Recordarme',
  'notif.at': 'A las',
  'notif.alertMeAt': 'Avisarme al',
  'notif.payday': 'Recordatorios de pago',
  'notif.paydaySub':
    'Un aviso el día de pago para registrar tus ingresos cuando lleguen.',
  'notif.day': 'Día',
  'notif.time': 'Hora',
  'notif.hideLockscreen': 'Ocultar importes en la pantalla de bloqueo',
  'notif.hideLockscreenSub':
    'Oculta los importes en las notificaciones hasta que desbloquees.',
  'notif.from': 'Desde',
  'notif.to': 'Hasta',
  'notif.quietOn': 'Sin notificaciones durante este periodo.',
  'notif.quietOff': 'Desactivado',
  'notif.onTheDay': 'El mismo día',
  'notif.oneDayBefore': '1 día antes',
  'notif.nDaysBefore': '{n} días antes',
  'notif.thresholdOption': '{pct}% del presupuesto',
  'notif.perm.granted.title': 'Notificaciones permitidas',
  'notif.perm.granted.sub':
    'Fino puede enviar notificaciones a este dispositivo.',
  'notif.perm.denied.title': 'Notificaciones desactivadas',
  'notif.perm.denied.sub':
    'Bloqueadas en los ajustes del sistema. Toca para abrir Ajustes.',
  'notif.perm.undetermined.title': 'Activar notificaciones',
  'notif.perm.undetermined.sub':
    'Recibe recordatorios de facturas, alertas de presupuesto y avisos de metas.',
  'notif.perm.default.title': 'Notificaciones',
  'notif.perm.default.sub': 'Gestiona cómo Fino se comunica contigo.',
  'notif.footer':
    'Las notificaciones respetan los permisos a nivel de dispositivo para Fino. Si el push no funciona, revisa Ajustes → Notificaciones → Fino en tu dispositivo.',
  'notif.sheet.reminderTime': 'Hora del recordatorio',
  'notif.sheet.threshold': 'Umbral de alerta de presupuesto',
  'notif.sheet.digestDay': 'Día del resumen semanal',
  'notif.sheet.digestTime': 'Hora del resumen semanal',
  'notif.sheet.quietStart': 'Inicio de horas de silencio',
  'notif.sheet.quietEnd': 'Fin de horas de silencio',

  // Currency screen (detail)
  'currency.searchPlaceholder': 'Buscar monedas',
  'currency.noMatch': 'Ninguna moneda coincide con "{query}"',

  // Language screen (detail)
  'language.footer':
    'Las traducciones son mantenidas por la comunidad. Las cadenas faltantes vuelven al inglés.',
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
