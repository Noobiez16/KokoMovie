data "aws_caller_identity" "current" {}

# ─── Central S3 Logging Bucket ────────────────────────────────────────────────

resource "aws_s3_bucket" "s3_logs" {
  bucket        = "streamflix-s3-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = { Purpose = "logs" }
}

resource "aws_s3_bucket_logging" "s3_logs" {
  bucket        = aws_s3_bucket.s3_logs.id
  target_bucket = aws_s3_bucket.s3_logs.id
  target_prefix = "s3_logs/"
}

# tfsec:ignore:aws-s3-enable-versioning-mfa-delete
# snyk:ignore:SNYK-CC-TF-127
# snyk:ignore:SNYK-CC-00234
resource "aws_s3_bucket_versioning" "s3_logs" {
  bucket = aws_s3_bucket.s3_logs.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "s3_logs" {
  bucket = aws_s3_bucket.s3_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "s3_logs" {
  bucket                  = aws_s3_bucket.s3_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── Media Bucket ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "media" {
  bucket        = "streamflix-media-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.environment != "production"
  tags          = { Purpose = "media" }
}

# tfsec:ignore:aws-s3-enable-versioning-mfa-delete
# snyk:ignore:SNYK-CC-TF-127
# snyk:ignore:SNYK-CC-00234
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

resource "aws_s3_bucket_logging" "media" {
  bucket        = aws_s3_bucket.media.id
  target_bucket = aws_s3_bucket.s3_logs.id
  target_prefix = "media/"
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

# tfsec:ignore:aws-s3-enable-versioning-mfa-delete
# snyk:ignore:SNYK-CC-TF-127
# snyk:ignore:SNYK-CC-00234
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

resource "aws_s3_bucket_logging" "assets" {
  bucket        = aws_s3_bucket.assets.id
  target_bucket = aws_s3_bucket.s3_logs.id
  target_prefix = "assets/"
}

# ─── MediaConvert Input Bucket ────────────────────────────────────────────────

resource "aws_s3_bucket" "ingest" {
  bucket        = "streamflix-ingest-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = { Purpose = "media-ingest" }
}

# tfsec:ignore:aws-s3-enable-versioning-mfa-delete
# snyk:ignore:SNYK-CC-TF-127
# snyk:ignore:SNYK-CC-00234
resource "aws_s3_bucket_versioning" "ingest" {
  bucket = aws_s3_bucket.ingest.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ingest" {
  bucket = aws_s3_bucket.ingest.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "ingest" {
  bucket                  = aws_s3_bucket.ingest.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "ingest" {
  bucket        = aws_s3_bucket.ingest.id
  target_bucket = aws_s3_bucket.s3_logs.id
  target_prefix = "ingest/"
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
