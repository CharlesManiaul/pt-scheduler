import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' = relative asset paths, so the build works at
// https://<user>.github.io/<any-repo-name>/ without hard-coding the repo name.
// (Navigation will use hash URLs like #/patients, which GitHub Pages serves without 404s.)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    // shown on the setup page so you can confirm a fresh deploy went live
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }),
    ),
  },
})
