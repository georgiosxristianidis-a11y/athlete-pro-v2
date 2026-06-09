// @ts-check
import { DB } from './db.js';

/**
 * #GIO: Athlete Pro Locale Store
 * Centralized dictionary for RU/EN localization.
 */

const DICT = {
  en: {
    'profile.title': 'Profile',
    'profile.wilks': 'DOTS',
    'profile.streak': 'Streak',
    'profile.volume30d': '30d Volume',
    'profile.hours30d': '30d Hours',
    'profile.customMode': 'Custom mode',
    'privacy.title': 'Privacy',
    'privacy.cloud': 'Cloud',
    'privacy.anon': 'Anonymous',
    'privacy.airgap': 'Air-Gapped',
    'privacy.desc.cloud': 'AI Coach + cloud sync available.',
    'privacy.desc.anon': 'AI works, but identifiers are stripped before sending.',
    'privacy.desc.airgap': 'Zero data leaves this device. AI is disabled.',
    'privacy.ai_coach': 'AI Coach',
    'privacy.ai_desc_airgap': 'Disabled in Air-Gapped mode',
    'privacy.ai_desc_active': 'Sends workout context to AI when on',
    'privacy.passport': 'Data Passport',
    'privacy.passport_sub': "See exactly what's stored, where",
    'privacy.audit': 'Privacy Budget',
    'privacy.audit_sub': 'Audit recent network activity',
    'privacy.device': 'On this device',
    'privacy.sent': 'Sent externally · last 30 days',
    'privacy.storage': 'Storage',
    'privacy.indexeddb': 'athlete-pro · this device only',
    'privacy.localstorage': 'session state · this device only',
    'privacy.cloud_server': 'AI proxy only when enabled',
    'privacy.export_all': 'Export all data',
    'privacy.delete_all': 'Delete all data',
    'privacy.audit_empty': 'No network activity recorded.',
    'privacy.clear_log': 'Clear log',
    'privacy.audit_summary': 'Last {total} network attempts · {sent} sent · {blocked} blocked',
    'privacy.status_sent': 'sent',
    'privacy.status_blocked': 'blocked',
    'privacy.delete_confirm': 'Delete ALL local data? This cannot be undone.',
    'privacy.close': 'Close',
    'privacy.tile.workouts': 'Workouts',
    'privacy.tile.pr': 'PR records',
    'privacy.tile.metrics': 'Body metrics',
    'privacy.tile.events': 'Events',
    'privacy.tile.settings': 'Settings',
    'privacy.tile.ai_requests': 'AI requests',
    'privacy.tile.sync_events': 'Sync events',
    'privacy.time_now': 'just now',
    'privacy.time_m': '{n}m ago',
    'privacy.time_h': '{n}h ago',
    'privacy.time_d': '{n}d ago',
    'settings.limits_saved': 'Limitations saved',

    'sync.status.idle': 'Up to date',
    'sync.status.syncing': 'Syncing...',
    'sync.status.error': 'Sync error',
    'sync.status.offline': 'Offline',
    'sync.connect': 'Connect Cloud',
    'sync.disconnect': 'Disconnect',
    'sync.last_sync': 'Last sync',
    'data.export': 'Export JSON',
    'data.export_csv': 'Export CSV',
    'data.import': 'Import JSON',
    'data.backup': 'Local Backup',
    'settings.general': 'GENERAL',
    'settings.training': 'TRAINING',
    'settings.ai': 'AI ASSISTANT',
    'settings.data': 'DATA & CLOUD',
    'settings.rest': 'Rest Duration',
    'settings.rest_sub': 'between sets',
    'settings.haptic': 'Haptic Feedback',
    'settings.haptic_sub': 'Tactile interface response',
    'settings.awake': 'Keep Screen Awake',
    'settings.awake_sub': 'Prevent sleep mode',
    'settings.lang': 'Language',
    'settings.lang_sub': 'Interface language',
    'settings.smart_progress': 'AI Smart Progress',
    'settings.smart_progress_sub': 'Auto +2.5 kg on success',
    'settings.unit': 'Weight Unit',
    'settings.unit_sub': 'Kilograms or pounds',
    'settings.mode': 'Training Mode',
    'settings.mode_sub': 'Coach adapts advice to phase',
    'settings.length': 'Session Length',
    'settings.length_sub': 'Max time cap (min)',
    'settings.limits': 'Limitations',
    'settings.limits_sub': 'Injuries or equipment restrictions',
 * Initialize locale from settings.
 */
export async function initLocale() {
  _lang = await DB.Settings.get('lang', 'en');
}

/**
 * Get current language.
 */
export function getLang() {
  return _lang;
}

/**
 * Set language.
 * @param {'en'|'ru'} lang 
 */
export async function setLang(lang) {
  _lang = lang;
  await DB.Settings.set('lang', lang);
  window.dispatchEvent(new CustomEvent('ap-locale-change', { detail: { lang } }));
}

/**
 * Translate a key.
 * @param {string} key 
 * @param {Object} [params] 
 * @returns {string}
 */
export function t(key, params = {}) {
  let str = DICT[_lang]?.[key] || DICT['en']?.[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}
