output "media_domain"       { value = aws_cloudfront_distribution.media.domain_name }
output "api_domain"         { value = aws_cloudfront_distribution.api.domain_name }
output "media_cdn_id"       { value = aws_cloudfront_distribution.media.id }
output "api_cdn_id"         { value = aws_cloudfront_distribution.api.id }
output "cloudfront_zone_id" { value = aws_cloudfront_distribution.media.hosted_zone_id }
output "waf_acl_arn"        { value = aws_wafv2_web_acl.main.arn }
