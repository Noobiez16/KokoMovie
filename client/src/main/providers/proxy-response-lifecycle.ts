interface EventSource {
  once(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

interface ResponseEventSource extends EventSource {
  writableEnded: boolean
}

export function bindProxyResponseLifecycle(
  request: EventSource,
  response: ResponseEventSource,
  abort: () => void,
): () => void {
  let aborted = false
  const abortOnce = () => {
    if (aborted) return
    aborted = true
    abort()
  }
  const onRequestAborted = () => abortOnce()
  const onResponseClosed = () => {
    if (!response.writableEnded) abortOnce()
  }

  // IncomingMessage "close" means the request message completed; it does not prove
  // that Chromium abandoned the outgoing response. Cancellation is represented by
  // request "aborted" or by the response closing before writableEnded.
  request.once('aborted', onRequestAborted)
  response.once('close', onResponseClosed)

  return () => {
    request.removeListener('aborted', onRequestAborted)
    response.removeListener('close', onResponseClosed)
  }
}
