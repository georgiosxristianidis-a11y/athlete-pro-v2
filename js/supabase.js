// @ts-check
// Safely access env vars (Vite injects them, otherwise fallback)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || ''

// Pull the Supabase SDK from the CDN ONLY when cloud is actually configured.
// A top-level static import fetched the CDN on every boot — in the default
// air-gapped/offline mode that request hung/408'd, taking down supabase.js and
// its whole import chain (sync.js et al.) and starving sibling module loads.
export const supabase = (supabaseUrl && supabaseKey)
  ? (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm'))
      .createClient(supabaseUrl, supabaseKey)
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
      console.log('Создаем анонимный профиль для нового друга...')
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      return data.user
    }

    console.log('Пользователь уже в системе:', session.user.id)
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
    console.log('Теперь можно делать запросы к базе!')
    // Только ПОСЛЕ этого вызывай свои функции загрузки данных, например:
    // fetchWorkouts()
  }
}

startApp()
*/
