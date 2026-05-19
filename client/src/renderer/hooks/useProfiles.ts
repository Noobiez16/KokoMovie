import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi, type CreateProfilePayload, type UpdateProfilePayload } from '../api/user'
import { useAuthStore } from '../store/auth'

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => userApi.listProfiles().then((r) => r.data),
    staleTime: 30 * 1000,
  })
}

export function useCreateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProfilePayload) => userApi.createProfile(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProfilePayload }) =>
      userApi.updateProfile(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteProfile() {
  const qc = useQueryClient()
  const setActiveProfile = useAuthStore((s) => s.setActiveProfile)
  const activeProfile = useAuthStore((s) => s.activeProfile)

  return useMutation({
    mutationFn: (id: string) => userApi.deleteProfile(id),
    onSuccess: (_data, id) => {
      if (activeProfile?.id === id) setActiveProfile(null)
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}
