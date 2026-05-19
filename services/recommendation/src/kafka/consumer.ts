// Kafka removed — playback events are no-ops
export interface PlaybackEvent {
  profileId: string
  contentId: string
  episodeId: string | null
  eventType: string
  positionSeconds: number
  durationSeconds: number
  timestamp: string
}

export async function startConsumer(_onEvent: (event: PlaybackEvent) => void): Promise<void> {}
export async function stopConsumer(): Promise<void> {}
