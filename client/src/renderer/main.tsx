import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { App } from './App'
import { queryClient } from './api/queryClient'
import { LocaleBootstrap } from './i18n/LocaleBootstrap'
import './i18n'
import './styles/globals.css'


const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleBootstrap queryClient={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </LocaleBootstrap>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-left" />}
    </QueryClientProvider>
  </StrictMode>,
)
