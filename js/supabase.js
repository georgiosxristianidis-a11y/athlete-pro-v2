import { createClient } from '@supabase/supabase-js'

// 1. ПРОВЕРЬ .env ФАЙЛ: Ключи должны называться VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

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
