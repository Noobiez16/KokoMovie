data "aws_caller_identity" "current" {}

# ─── Media Bucket ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "media" {
  bucket        = "streamflix-media-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.environment != "production"
  tags          = { Purpose = "media" }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_intelligent_tiering_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  name   = "entire-bucket"
  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }
  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

# ─── Assets Bucket ────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "assets" {
  bucket        = "streamflix-assets-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.environment != "production"
  tags          = { Purpose = "assets" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── MediaConvert Input Bucket ────────────────────────────────────────────────

resource "aws_s3_bucket" "ingest" {
  bucket        = "streamflix-ingest-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = { Purpose = "media-ingest" }
}

resource "aws_s3_bucket_lifecycle_configuration" "ingest" {
  bucket = aws_s3_bucket.ingest.id
  rule {
    id     = "delete-after-7-days"
    status = "Enabled"
    expiration { days = 7 }
    filter {}
  }
}
