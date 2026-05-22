export function getCookie(name: string): string {
  const cookies = document.cookie ? document.cookie.split('; ') : []
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=')
    if (decodeURIComponent(key) === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return ''
}
