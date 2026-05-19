variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "dr_region" {
  description = "Disaster recovery AWS region"
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "Root domain (e.g. streamflix.com)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_password" {
  description = "Master password for Aurora PostgreSQL"
  type        = string
  sensitive   = true
}

variable "rds_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "elasticache_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r7g.large"
}

variable "msk_broker_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "cloudfront_key_pair_id" {
  description = "CloudFront key pair ID for signed URLs"
  type        = string
  sensitive   = true
}

variable "stripe_secret_arn" {
  description = "ARN of Secrets Manager secret containing Stripe API key"
  type        = string
}

variable "anthropic_api_key_arn" {
  description = "ARN of Secrets Manager secret containing Anthropic API key"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy (usually git SHA)"
  type        = string
  default     = "latest"
}

variable "ecs_desired_count" {
  description = "Desired task count per ECS service"
  type        = number
  default     = 2
}
