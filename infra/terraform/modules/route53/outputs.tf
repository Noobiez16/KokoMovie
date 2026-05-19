output "api_fqdn"             { value = "api.${var.domain_name}" }
output "media_fqdn"           { value = "media.${var.domain_name}" }
output "health_check_id"      { value = aws_route53_health_check.api.id }
