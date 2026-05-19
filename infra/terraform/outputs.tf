output "api_endpoint" {
  description = "API Gateway / ALB DNS name"
  value       = "https://api.${var.domain_name}"
}

output "media_cdn_endpoint" {
  description = "CloudFront media CDN domain"
  value       = module.cloudfront.media_domain
}

output "ecr_registry" {
  description = "ECR registry URL for service images"
  value       = module.ecr.registry_url
}

output "rds_endpoint" {
  description = "Aurora writer endpoint"
  value       = module.rds.writer_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = module.elasticache.primary_endpoint
  sensitive   = true
}

output "kafka_brokers" {
  description = "MSK bootstrap broker string (TLS)"
  value       = module.msk.bootstrap_brokers_tls
  sensitive   = true
}

output "media_bucket_name" {
  description = "S3 media bucket name"
  value       = module.s3.media_bucket_name
}

output "assets_bucket_name" {
  description = "S3 assets bucket name"
  value       = module.s3.assets_bucket_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN for CI/CD deployments"
  value       = module.ecs.cluster_arn
}
