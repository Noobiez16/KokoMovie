// Kafka removed — playback events are no-ops
export interface PlaybackEvent {
  profileId: string
  contentId: string
  episodeId: string | null
  sessionId: string
  eventType: 'started' | 'paused' | 'resumed' | 'completed' | 'heartbeat' | 'quality_change'
  positionSeconds: number
  durationSeconds: number
  quality: string
  timestamp: string
}

export async function emitPlaybackEvent(_event: PlaybackEvent): Promise<void> {}
export async function disconnectProducer(): Promise<void> {}
