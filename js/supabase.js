// @ts-check
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm'

// Safely access env vars (Vite injects them, otherwise fallback)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || ''

// Only create client if config exists, otherwise use a dummy to prevent crashes
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : { auth: { getSession: async () => ({data:{session:null}}), signInAnonymously: async () => ({error: new Error('Supabase not configured')}) } };

/**
 * Эта функция создает анонимного пользователя.
 * Её нужно вызвать ОДИН РАЗ при самом старте приложения.
 */
export async function setupUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      console.log('🔄 Создаем анонимный профиль для нового друга...')
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      return data.user
    }

    console.log('✅ Пользователь уже в системе:', session.user.id)
    return session.user
  } catch (error) {
    console.error('❌ Ошибка входа:', error.message)
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
