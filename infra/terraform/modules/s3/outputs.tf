output "media_bucket_name"            { value = aws_s3_bucket.media.bucket }
output "media_bucket_arn"             { value = aws_s3_bucket.media.arn }
output "media_bucket_regional_domain" { value = aws_s3_bucket.media.bucket_regional_domain_name }
output "assets_bucket_name"           { value = aws_s3_bucket.assets.bucket }
output "assets_bucket_arn"            { value = aws_s3_bucket.assets.arn }
output "assets_bucket_regional_domain"{ value = aws_s3_bucket.assets.bucket_regional_domain_name }
output "ingest_bucket_name"           { value = aws_s3_bucket.ingest.bucket }
output "logs_bucket_id"               { value = aws_s3_bucket.s3_logs.id }
