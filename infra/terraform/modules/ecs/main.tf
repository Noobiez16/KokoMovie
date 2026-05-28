locals {
  services = {
    auth = {
      port = 3001, cpu = 512, memory = 1024
      env = [
        { name = "AUTH_PORT", value = "3001" },
        { name = "NODE_ENV", value = "production" },
      ]
    }
    catalog = {
      port = 3002, cpu = 1024, memory = 2048
      env = [
        { name = "CATALOG_PORT", value = "3002" },
        { name = "NODE_ENV", value = "production" },
      ]
    }
    playback = {
      port = 3003, cpu = 512, memory = 1024
      env = [
        { name = "PLAYBACK_PORT", value = "3003" },
        { name = "NODE_ENV", value = "production" },
        { name = "CLOUDFRONT_DOMAIN", value = var.cloudfront_domain },
        { name = "CLOUDFRONT_KEY_PAIR_ID", value = var.cloudfront_key_pair_id },
      ]
    }
    user = {
      port = 3004, cpu = 512, memory = 1024
      env = [
        { name = "USER_PORT", value = "3004" },
        { name = "NODE_ENV", value = "production" },
        { name = "S3_ASSETS_BUCKET", value = var.assets_bucket },
      ]
    }
    recommendation = {
      port = 3005, cpu = 512, memory = 1024
      env = [
        { name = "RECOMMENDATION_PORT", value = "3005" },
        { name = "NODE_ENV", value = "production" },
      ]
    }
  }
}

# ─── ECS Cluster ─────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "streamflix-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "streamflix-${var.environment}" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = var.desired_count
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ─── ALB ─────────────────────────────────────────────────────────────────────

# tfsec:ignore:aws-elb-alb-not-public
# snyk:ignore:SNYK-CC-TF-124
# snyk:ignore:SNYK-CC-TF-125
# snyk:ignore:SNYK-CC-00231
resource "aws_lb" "main" {
  name               = "streamflix-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production"
  drop_invalid_header_fields = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "alb"
    enabled = true
  }

  tags = { Name = "streamflix-${var.environment}-alb" }
}

resource "aws_s3_bucket" "alb_logs" {
  bucket        = "streamflix-alb-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# tfsec:ignore:aws-s3-enable-versioning-mfa-delete
# snyk:ignore:SNYK-CC-TF-127
# snyk:ignore:SNYK-CC-00234
resource "aws_s3_bucket_versioning" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "alb_logs" {
  bucket        = aws_s3_bucket.alb_logs.id
  target_bucket = var.s3_logs_bucket_id
  target_prefix = "alb_logs/"
}

data "aws_caller_identity" "current" {}
data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = data.aws_elb_service_account.main.arn }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.alb_logs.arn}/alb/*"
    }]
  })
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"error\":\"NOT_FOUND\"}"
      status_code  = "404"
    }
  }

  depends_on = [aws_acm_certificate_validation.main]
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_acm_certificate" "main" {
  domain_name               = "api.${var.domain_name}"
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn
}

# ─── IAM Roles ────────────────────────────────────────────────────────────────

resource "aws_iam_role" "task_execution" {
  name = "streamflix-${var.environment}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "streamflix-${var.environment}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["arn:aws:s3:::${var.media_bucket}/*", "arn:aws:s3:::${var.assets_bucket}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/streamflix-${var.environment}-*"
      },
      {
        Effect   = "Allow"
        Action   = ["kafka-cluster:Connect", "kafka-cluster:DescribeCluster", "kafka-cluster:ReadData", "kafka-cluster:WriteData", "kafka-cluster:DescribeTopic", "kafka-cluster:CreateTopic"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["personalize:GetRecommendations", "personalize:PutEvents"]
        Resource = "*"
      }
    ]
  })
}

# ─── CloudWatch Log Groups ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "services" {
  for_each          = local.services
  name              = "/ecs/streamflix-${var.environment}/${each.key}"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn
}

# ─── Task Definitions ────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "streamflix-${var.environment}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = "${var.ecr_registry}/streamflix-${each.key}:${var.image_tag}"
    essential = true
    portMappings = [{ containerPort = each.value.port, protocol = "tcp" }]

    environment = concat(each.value.env, [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_MEDIA_BUCKET", value = var.media_bucket },
      { name = "KAFKA_BROKERS", value = var.kafka_brokers },
    ])

    secrets = [
      { name = "DATABASE_URL", valueFrom = "${var.db_secret_arn}:url::" },
      { name = "REDIS_URL", valueFrom = var.redis_endpoint },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/ecs/streamflix-${var.environment}/${each.key}"
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:${each.value.port}/health || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Service = each.key }
}

# ─── ALB Target Groups + Listener Rules ──────────────────────────────────────

resource "aws_lb_target_group" "service" {
  for_each = local.services

  name        = "sf-${var.environment}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30
  tags                 = { Service = each.key }
}

locals {
  route_map = {
    auth           = { priority = 10, path = "/auth/*" }
    catalog        = { priority = 20, path = "/catalog/*" }
    playback       = { priority = 30, path = "/playback/*" }
    user           = { priority = 40, path = "/user/*" }
    recommendation = { priority = 50, path = "/recommendations/*" }
  }
}

resource "aws_lb_listener_rule" "service" {
  for_each     = local.route_map
  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }

  condition {
    path_pattern { values = [each.value.path] }
  }
}

# ─── ECS Services ────────────────────────────────────────────────────────────

resource "aws_ecs_service" "service" {
  for_each = local.services

  name            = "streamflix-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 100
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller { type = "ECS" }

  enable_execute_command = var.environment != "production"

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_lb_listener.https]
}

# ─── Auto Scaling ─────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "service" {
  for_each           = local.services
  max_capacity       = 20
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.service[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = local.services
  name               = "streamflix-${var.environment}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
