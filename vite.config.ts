import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Vercelはドメイン直下で配信するため '/'、GitHub Pagesはリポジトリ名配下のため '/try2/'
  base: process.env.VERCEL ? '/' : '/try2/',
  plugins: [react()],
})
