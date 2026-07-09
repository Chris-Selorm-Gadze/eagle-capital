import { useAuth } from './features/auth/AuthContext'
import { HomePage } from './features/auth/HomePage'
import App from './App'

export function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <HomePage />
  return <App />
}
