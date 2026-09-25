// @ts-check
// Safely access env vars (Vite injects them, otherwise fallback)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || ''

// True only when real Supabase creds are present; otherwise `supabase` below is
// an inert stub. Lets UI (e.g. the Island sync dot) distinguish "synced" from
// "no cloud configured" without poking the stub.
export const isCloudConfigured = !!(supabaseUrl && supabaseKey);
// Mirror to a global (same pattern as window.__privacyMode) so the core Island
// module can read it without statically importing supabase.js — that would drag
// its top-level CDN await into the island's boot-critical import chain.
if (typeof window !== 'undefined') window.__cloudConfigured = isCloudConfigured;

/**
 * Same-origin, vendored SDK (js/vendor/supabase.umd.js — see
 * scripts/vendor-supabase.mjs) — CORE-S. Used to be a top-level
 * `import('https://cdn.jsdelivr.net/...')`: a CDN origin in `script-src` is a
 * standing amplifier for any future XSS, and in the default air-gapped mode
 * the request itself hung/408'd, taking down supabase.js and its whole import
 * chain (sync.js et al.) and starving sibling module loads. Loaded lazily
 * (not a static `import`) so it still only fires when cloud is configured.
 */
async function loadSupabaseSdk() {
  if (globalThis.supabase?.createClient) return globalThis.supabase;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/js/vendor/supabase.umd.js';
    script.onload = () => resolve(undefined);
    script.onerror = () => reject(new Error('failed to load vendored Supabase SDK'));
    document.head.appendChild(script);
  });
  return globalThis.supabase;
}

export const supabase = (supabaseUrl && supabaseKey)
  ? (await loadSupabaseSdk()).createClient(supabaseUrl, supabaseKey)
  : {
      auth: { 
        getSession: async () => ({ data: { session: null }, error: null }), 
        getUser: async () => ({ data: { user: null }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        signInAnonymously: async () => ({ error: new Error('Supabase not configured') }) 
      },
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
        upsert: async () => ({ data: null, error: new Error('Supabase not configured') })
      })
    };

/**
 * Эта функция создает анонимного пользователя.
 * Её нужно вызвать ОДИН РАЗ при самом старте приложения.
 */
export async function setupUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
//       console.log('Создаем анонимный профиль для нового друга...')
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      return data.user
    }

//     console.log('Пользователь уже в системе:', session.user.id)
    return session.user
  } catch (error) {
    console.error('Ошибка входа:', error.message)
    return null
  }
}

/* ================================================================
КУДА ВСТАВЛЯТЬ ВЫЗОВ (ПРИМЕР ДЛЯ ТВОЕГО main.js или App.js):
================================================================

import { setupUser } from './supabase.js'

async function startApp() {
  // Сначала логиним пользователя
  const user = await setupUser()

  if (user) {
//     console.log('Теперь можно делать запросы к базе!')
    // Только ПОСЛЕ этого вызывай свои функции загрузки данных, например:
    // fetchWorkouts()
  }
}

startApp()
*/
