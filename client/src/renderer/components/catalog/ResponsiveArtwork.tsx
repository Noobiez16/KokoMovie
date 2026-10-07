import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  className: string
}

// Only catalog backdrops at the known 1280px tier can be upgraded. Local,
// custom and signed URLs retain their original meaning and offline behavior.
function originalArtworkUrl(src: string): string | null {
  const match = /^(catalog-cache:\/\/image\/|https:\/\/image\.tmdb\.org\/t\/p\/)w1280(\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp))$/.exec(src)
  return match ? `${match[1]}original${match[2]}` : null
}

export function ResponsiveArtwork({ src, className }: Props) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [requiredWidth, setRequiredWidth] = useState(0)
  const [aspect, setAspect] = useState({ src, ratio: 16 / 9 })
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const ratio = aspect.src === src ? aspect.ratio : 16 / 9

  useEffect(() => {
    const container = imageRef.current?.parentElement
    if (!container) return
    const measure = () => {
      const { width, height } = container.getBoundingClientRect()
      // Contain sizing: blank space around the image does not need extra pixels.
      setRequiredWidth(Math.min(width, height * ratio) * (window.devicePixelRatio || 1))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(container)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ratio, src])

  const original = requiredWidth > 1280 && failedSource !== src ? originalArtworkUrl(src) : null
  return <img ref={imageRef} src={original ?? src} alt="" className={className}
    onLoad={event => {
      const { naturalWidth, naturalHeight } = event.currentTarget
      if (naturalWidth > 0 && naturalHeight > 0) {
        const loadedRatio = naturalWidth / naturalHeight
        if (aspect.src !== src || aspect.ratio !== loadedRatio) setAspect({ src, ratio: loadedRatio })
      }
    }}
    onError={() => { if (original) setFailedSource(src) }}
  />
}
