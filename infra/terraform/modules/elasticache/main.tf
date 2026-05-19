resource "aws_elasticache_subnet_group" "main" {
  name       = "streamflix-${var.environment}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "streamflix-${var.environment}"
  description                = "Streamflix ${var.environment} Redis cluster"
  node_type                  = var.node_type
  num_cache_clusters         = 3
  automatic_failover_enabled = true
  multi_az_enabled           = true

  engine               = "redis"
  engine_version       = "7.2"
  port                 = 6379
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.cache_security_group_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = 5
  snapshot_window          = "03:00-04:00"

  log_delivery_configuration {
    destination      = "/elasticache/streamflix-${var.environment}/slow-logs"
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = { Name = "streamflix-${var.environment}-redis" }
}

resource "aws_cloudwatch_log_group" "redis_slow_logs" {
  name              = "/elasticache/streamflix-${var.environment}/slow-logs"
  retention_in_days = 7
}

resource "aws_secretsmanager_secret" "redis" {
  name = "streamflix/${var.environment}/redis-url"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id     = aws_secretsmanager_secret.redis.id
  secret_string = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
