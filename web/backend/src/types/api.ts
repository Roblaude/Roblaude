export interface ApiError {
  error: string
  details?: unknown
}

export interface ApiSuccess<T> {
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
