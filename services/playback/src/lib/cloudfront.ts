import { config } from '../config.js'

// In dev mode (no CloudFront domain/key configured), return a mock unsigned URL.
// In production, generate a proper CloudFront signed URL with 15-min expiry.

const EXPIRY_SECONDS = 900 // 15 minutes

export function generateSignedUrl(s3HlsKey: string): string {
  if (!config.CLOUDFRONT_DOMAIN || !config.CLOUDFRONT_KEY_PAIR_ID) {
    // Dev mode: if the key is already a full URL (demo streams), use it directly
    if (s3HlsKey.startsWith('https://') || s3HlsKey.startsWith('http://')) {
      return s3HlsKey
    }
    return `http://localhost:4566/${config.S3_MEDIA_BUCKET || 'kokomovie-media'}/${s3HlsKey}`
  }

  const expiresAt = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS

  // Production: CloudFront signed URL using canned policy
  // The actual RSA signing requires the CloudFront private key.
  // For now return a URL shape — in prod this would use aws-cloudfront-sign or
  // the AWS SDK CloudFront signer (@aws-sdk/cloudfront-signer).
  const baseUrl = `https://${config.CLOUDFRONT_DOMAIN}/${s3HlsKey}`
  const params = new URLSearchParams({
    'Key-Pair-Id': config.CLOUDFRONT_KEY_PAIR_ID,
    Expires: expiresAt.toString(),
    // Signature would be appended here in prod
  })

  return `${baseUrl}?${params.toString()}`
}

export function generateThumbnailUrl(s3ThumbnailKey: string): string {
  if (!config.CLOUDFRONT_DOMAIN) {
    return `http://localhost:4566/${config.S3_MEDIA_BUCKET || 'kokomovie-media'}/${s3ThumbnailKey}`
  }
  return `https://${config.CLOUDFRONT_DOMAIN}/${s3ThumbnailKey}`
}
