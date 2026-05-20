import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authApi, type LoginPayload, type RegisterPayload } from '../api/auth'
import { useAuthStore } from '../store/auth'

export function useLogin() {
  const setAccount = useAuthStore((s) => s.setAccount)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: LoginPayload & { stayLogged?: boolean }) => authApi.login(payload),
    onSuccess: async (response, variables) => {
      const { accessToken, refreshToken, account } = response.data
      const persist = variables.stayLogged ?? false
      await window.electronAPI?.setAuthToken(accessToken)
      await window.electronAPI?.setRefreshToken(refreshToken, persist)
      setAccount(account)
      navigate('/profiles')
    },
  })
}

export function useRegister() {
  const setAccount = useAuthStore((s) => s.setAccount)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: async (response) => {
      const { accessToken, refreshToken, account } = response.data
      await window.electronAPI?.setAuthToken(accessToken)
      await window.electronAPI?.setRefreshToken(refreshToken, true)
      setAccount(account)
      navigate('/profiles')
    },
  })
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const refreshToken = await window.electronAPI?.getRefreshToken()
      if (refreshToken) await authApi.logout(refreshToken)
      await window.electronAPI?.clearAuthToken()
      await window.electronAPI?.setRefreshToken('', true)
    },
    onSettled: () => {
      logout()
      qc.clear()
      navigate('/login')
    },
  })
}

