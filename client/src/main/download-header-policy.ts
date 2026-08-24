function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

export function headersForDownloadTarget(
  targetUrl: string,
  sourceUrl: string,
  storedHeaders: Record<string, string> | undefined,
  registeredHeaders: Record<string, string>,
): Record<string, string> {
  const eligibleStoredHeaders = sameOrigin(targetUrl, sourceUrl) ? storedHeaders ?? {} : {}
  const merged: Record<string, string> = { ...eligibleStoredHeaders }
  const names = new Map(Object.keys(merged).map((name) => [name.toLowerCase(), name]))
  for (const [name, value] of Object.entries(registeredHeaders)) {
    const existing = names.get(name.toLowerCase())
    if (existing) delete merged[existing]
    merged[name] = value
    names.set(name.toLowerCase(), name)
  }
  return merged
}
