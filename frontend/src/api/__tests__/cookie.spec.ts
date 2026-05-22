import { describe, expect, it } from 'vitest'
import { getCookie } from '@/utils/cookie'

describe('getCookie', () => {
  it('returns cookie value', () => {
    document.cookie = 'csrf_token=abc'
    expect(getCookie('csrf_token')).toBe('abc')
  })
})
