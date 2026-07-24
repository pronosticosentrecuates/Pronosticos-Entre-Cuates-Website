import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')

  if (mode === 'production') {
    const requiredVariables = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const
    const missingVariables = requiredVariables.filter((name) => !env[name]?.trim())

    if (missingVariables.length > 0) {
      throw new Error(`Faltan variables requeridas para produccion: ${missingVariables.join(', ')}`)
    }

    if (!env.VITE_SUPABASE_URL.startsWith('https://') || !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
      throw new Error('La configuracion publica de Supabase para produccion no es valida.')
    }
  }

  return {
    plugins: [react()],
  }
})
