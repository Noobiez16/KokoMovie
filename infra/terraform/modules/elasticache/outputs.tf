output "primary_endpoint" { value = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"; sensitive = true }
output "secret_arn"       { value = aws_secretsmanager_secret.redis.arn }
