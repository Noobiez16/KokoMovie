export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta: ResponseMeta
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
  meta: ResponseMeta
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface ResponseMeta {
  requestId: string
  timestamp: string
}

export interface ApiError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export type ErrorCode =
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_TAKEN'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_MFA_INVALID'
  | 'AUTH_DEVICE_NOT_FOUND'
  | 'SUBSCRIPTION_REQUIRED'
  | 'PLAN_UPGRADE_REQUIRED'
  | 'CONTENT_NOT_FOUND'
  | 'PROFILE_LIMIT_REACHED'
  | 'PROFILE_NOT_FOUND'
  | 'DRM_LICENSE_DENIED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
