export const FIXTURE_HEADER_VALUE = ['fixture', 'value'].join('-')
export const FIXTURE_BEARER_VALUE = ['Bearer', FIXTURE_HEADER_VALUE].join(' ')
export const FIXTURE_COOKIE_VALUE = ['session', FIXTURE_HEADER_VALUE].join('=')

export function urlWithFixtureCredentials(hostname: string, pathname = '/') {
  const url = new URL('https://example.test/')
  url.hostname = hostname
  url.pathname = pathname
  url.username = ['fixture', 'user'].join('-')
  url.password = ['fixture', 'value'].join('-')
  return url.toString()
}
