variable "environment"              { type = string }
variable "aws_region"               { type = string }
variable "vpc_id"                   { type = string }
variable "public_subnet_ids"        { type = list(string) }
variable "private_subnet_ids"       { type = list(string) }
variable "alb_security_group_id"    { type = string }
variable "ecs_security_group_id"    { type = string }
variable "ecr_registry"             { type = string }
variable "image_tag"                { type = string }
variable "db_secret_arn"            { type = string }
variable "redis_endpoint"           { type = string; sensitive = true }
variable "kafka_brokers"            { type = string; sensitive = true }
variable "media_bucket"             { type = string }
variable "assets_bucket"            { type = string }
variable "cloudfront_domain"        { type = string }
variable "cloudfront_key_pair_id"   { type = string; sensitive = true }
variable "stripe_secret_arn"        { type = string }
variable "anthropic_api_key_arn"    { type = string }
variable "desired_count"            { type = number }
variable "domain_name"              { type = string; default = "streamflix.com" }
variable "kms_key_arn"              { type = string }
variable "s3_logs_bucket_id"        { type = string }
