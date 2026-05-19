resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "streamflix-${var.environment}"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "streamflix-${var.environment}-db-subnet-group" }
}

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "streamflix-${var.environment}-aurora-pg16"
  family      = "aurora-postgresql16"
  description = "Streamflix Aurora PostgreSQL 16 parameters"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # log queries > 1s
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier        = "streamflix-${var.environment}"
  engine                    = "aurora-postgresql"
  engine_version            = "16.2"
  database_name             = "streamflix"
  master_username           = "streamflix"
  master_password           = var.db_password
  db_subnet_group_name      = aws_db_subnet_group.main.name
  vpc_security_group_ids    = [var.db_security_group_id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  backup_retention_period      = 35
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  deletion_protection          = var.environment == "production"
  skip_final_snapshot          = var.environment != "production"
  final_snapshot_identifier    = var.environment == "production" ? "streamflix-${var.environment}-final" : null

  storage_encrypted = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = { Name = "streamflix-${var.environment}" }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier           = "streamflix-${var.environment}-writer"
  cluster_identifier   = aws_rds_cluster.main.id
  instance_class       = var.instance_class
  engine               = aws_rds_cluster.main.engine
  engine_version       = aws_rds_cluster.main.engine_version
  db_subnet_group_name = aws_db_subnet_group.main.name

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn

  tags = { Role = "writer" }
}

resource "aws_rds_cluster_instance" "reader" {
  identifier           = "streamflix-${var.environment}-reader"
  cluster_identifier   = aws_rds_cluster.main.id
  instance_class       = "db.r6g.medium"
  engine               = aws_rds_cluster.main.engine
  engine_version       = aws_rds_cluster.main.engine_version
  db_subnet_group_name = aws_db_subnet_group.main.name

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn

  tags = { Role = "reader" }
}

# Enhanced monitoring role
resource "aws_iam_role" "rds_monitoring" {
  name = "streamflix-${var.environment}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Store connection string in Secrets Manager
resource "aws_secretsmanager_secret" "db" {
  name = "streamflix/${var.environment}/database-url"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    url      = "postgresql://streamflix:${var.db_password}@${aws_rds_cluster.main.endpoint}:5432/streamflix"
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    dbname   = "streamflix"
    username = "streamflix"
    password = var.db_password
  })
}
