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
    'settings.limits_placeholder': 'e.g. bad left shoulder, no barbell',
    'settings.engine_claude': 'Claude',
    'settings.engine_gemini': 'Gemini',
    'settings.gemini_key': 'GEMINI API KEY (LOCAL)',
    'settings.gemini_get_key': 'GET KEY',
    'settings.gemini_placeholder_server': 'Using server-side key',
    'settings.gemini_placeholder_opt': 'AI... (optional)',
  },
  ru: {
    'profile.title': 'Профиль',
    'profile.wilks': 'DOTS',
    'profile.streak': 'Серия',
    'profile.volume30d': 'Объём 30 дней',
    'profile.hours30d': 'Часы 30 дней',
    'profile.customMode': 'Расширенный режим',
    'privacy.title': 'Приватность',
    'privacy.cloud': 'Облако',
    'privacy.anon': 'Аноним',
    'privacy.airgap': 'Без сети',
    'privacy.desc.cloud': 'AI Тренер + облачная синхронизация доступны.',
    'privacy.desc.anon': 'AI работает, но идентификаторы удаляются перед отправкой.',
    'privacy.desc.airgap': 'Ни байта не покидает устройство. AI отключен.',
    'privacy.ai_coach': 'AI Тренер',
    'privacy.ai_desc_airgap': 'Отключен в режиме "Без сети"',
    'privacy.ai_desc_active': 'Отправляет контекст тренировки AI при включении',
    'privacy.passport': 'Паспорт данных',
    'privacy.passport_sub': 'Смотрите, что и где хранится',
    'privacy.audit': 'Бюджет приватности',
    'privacy.audit_sub': 'Аудит недавней сетевой активности',
    'privacy.device': 'На этом устройстве',
    'privacy.sent': 'Отправлено наружу · последние 30 дней',
    'privacy.storage': 'Хранилище',
    'privacy.indexeddb': 'athlete-pro · только на устройстве',
    'privacy.localstorage': 'состояние сессии · только на устройстве',
    'privacy.cloud_server': 'Только прокси для AI, если включен',
    'privacy.export_all': 'Экспорт всех данных',
    'privacy.delete_all': 'Удалить все данные',
    'privacy.audit_empty': 'Сетевая активность не зафиксирована.',
    'privacy.clear_log': 'Очистить лог',
    'sync.status.idle': 'Синхронизировано',
    'sync.status.syncing': 'Синхронизация...',
    'sync.status.error': 'Ошибка синхр.',
    'sync.status.offline': 'Оффлайн',
    'sync.connect': 'Облако',
    'sync.disconnect': 'Отключить',
    'sync.last_sync': 'Синхр.',
    'data.export': 'Экспорт JSON',
    'data.import': 'Импорт JSON',
    'data.backup': 'Резервное копирование',
    'settings.general': 'ОСНОВНОЕ',
    'settings.training': 'ТРЕНИРОВКИ',
    'settings.ai': 'AI АССИСТЕНТ',
    'settings.data': 'ДАННЫЕ И ОБЛАКО',
    'settings.rest': 'Время отдыха',
    'settings.rest_sub': 'между подходами',
    'settings.haptic': 'Тактильный отклик',
    'settings.haptic_sub': 'Вибрация интерфейса',
    'settings.awake': 'Не выключать экран',
    'settings.awake_sub': 'Экран не гаснет',
    'settings.lang': 'Язык',
    'settings.lang_sub': 'Язык интерфейса',
    'settings.smart_progress': 'Умная прогрессия',
    'settings.smart_progress_sub': 'Авто +2.5 кг при успехе',
    'settings.unit': 'Единицы веса',
    'settings.unit_sub': 'Килограммы или фунты',
    'settings.mode': 'Режим тренировок',
    'settings.mode_sub': 'Адаптация советов под фазу',
    'settings.length': 'Длина сессии',
    'settings.length_sub': 'Лимит времени (мин)',
    'settings.limits': 'Ограничения',
    'settings.limits_sub': 'Травмы или инвентарь',
    'settings.limits_placeholder': 'напр. болит плечо, нет штанги',
    'settings.engine_claude': 'Claude',
    'settings.engine_gemini': 'Gemini',
    'settings.gemini_key': 'GEMINI API KEY (LOCAL)',
    'settings.gemini_get_key': 'ПОЛУЧИТЬ КЛЮЧ',
    'settings.gemini_placeholder_server': 'Используется ключ сервера',
    'settings.gemini_placeholder_opt': 'AI... (опционально)',
    'analytics.title': 'Аналитика',
    'analytics.sub': 'Обзор прогресса',
    'analytics.sessions': 'Тренировки',
    'analytics.total_vol': 'Общий объем',
    'analytics.avg_time': 'Ср. время',
    'analytics.ppl_balance': 'Баланс PPL',
    'analytics.weekly_progress': 'Прогресс объема',
    'analytics.est_1rm': 'Рекорды (1RM)',
    'analytics.empty_title': 'Данных пока нет',
    'analytics.empty_desc': 'Завершите свою первую тренировку, чтобы увидеть статистику.',
    'analytics.start_first': 'Начать тренировку',
    'metrics.title': 'Замеры',
    'metrics.history': 'История',
    'metrics.data': 'Данные тела',
    'metrics.weight': 'Вес',
    'metrics.height': 'Рост',
    'metrics.bmi': 'ИМТ',
    'metrics.fat': 'Жир',
    'metrics.fat_hint': 'Заполните талию, шею{hip} ниже для расчета % жира',
    'metrics.last_updated': 'Последнее',
    'metrics.add_entry': 'Добавить',
    'metrics.empty_title': 'Замеров пока нет',
    'metrics.empty_sub': 'Нажмите "Добавить", чтобы записать первые данные тела',
    'metrics.delete_confirm_title': 'Удалить запись?',
    'metrics.delete_confirm_body': 'Удалить замер за {date}? Это действие нельзя отменить.',
    'metrics.save': 'Сохранить',
    'metrics.sex': 'Пол',
    'metrics.male': 'Муж',
    'metrics.female': 'Жен',
    'metrics.sex_hint': 'Используется для формулы ВМС США',
  }
};

let _lang = 'en';

/**
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
