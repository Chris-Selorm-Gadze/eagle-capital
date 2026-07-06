import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { seedIfEmpty } from './db/seed'
import { AuthProvider } from './features/auth/AuthContext'
import './theme.css'

seedIfEmpty().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  )
})
