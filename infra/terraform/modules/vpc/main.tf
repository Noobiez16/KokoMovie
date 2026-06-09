locals {
  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  public_cidrs    = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 8, i)]
  private_cidrs   = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 10)]
  database_cidrs  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 20)]
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ─── VPC ─────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "streamflix-${var.environment}" }
}

# ─── Internet Gateway ─────────────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "streamflix-${var.environment}-igw" }
}

# ─── Public Subnets ───────────────────────────────────────────────────────────

resource "aws_subnet" "public" {
  count                   = length(local.azs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = { Name = "streamflix-${var.environment}-public-${local.azs[count.index]}" }
}

# ─── Private App Subnets ──────────────────────────────────────────────────────

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "streamflix-${var.environment}-private-${local.azs[count.index]}" }
}

# ─── Database Subnets ────────────────────────────────────────────────────────

resource "aws_subnet" "database" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.database_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "streamflix-${var.environment}-database-${local.azs[count.index]}" }
}

# ─── NAT Gateways ─────────────────────────────────────────────────────────────

resource "aws_eip" "nat" {
  count  = length(local.azs)
  domain = "vpc"
  tags   = { Name = "streamflix-${var.environment}-nat-eip-${count.index}" }
}

resource "aws_nat_gateway" "main" {
  count         = length(local.azs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "streamflix-${var.environment}-nat-${local.azs[count.index]}" }
  depends_on    = [aws_internet_gateway.main]
}

# ─── Route Tables ────────────────────────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "streamflix-${var.environment}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = length(local.azs)
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
  tags = { Name = "streamflix-${var.environment}-private-rt-${local.azs[count.index]}" }
}

resource "aws_route_table_association" "private" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ─── Security Groups ──────────────────────────────────────────────────────────

# tfsec:ignore:aws-ec2-no-public-ingress-sgr
# tfsec:ignore:aws-ec2-no-public-egress-sgr
# snyk:ignore:SNYK-CC-TF-70
# snyk:ignore:SNYK-CC-TF-72
# snyk:ignore:SNYK-CC-TF-73
# snyk:ignore:SNYK-CC-00170
# snyk:ignore:SNYK-CC-00171
# snyk:ignore:SNYK-CC-00176  -- ALB must accept inbound from internet (public load balancer by design)
resource "aws_security_group" "alb" {
  name        = "streamflix-${var.environment}-alb"
  description = "ALB: allow HTTPS inbound from internet (public-facing load balancer)"
  vpc_id      = aws_vpc.main.id

  # Intentionally open to 0.0.0.0/0 — this is the public entry point for the hosted backend.
  # Restricting to specific CIDRs is not feasible for a consumer-facing service.
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS inbound from internet (public-facing ALB)"
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP redirect to HTTPS (public-facing ALB)"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound (health checks, backend services)"
  }
  tags = { Name = "streamflix-${var.environment}-alb-sg" }
}

# tfsec:ignore:aws-ec2-no-public-egress-sgr
# snyk:ignore:SNYK-CC-TF-73
# snyk:ignore:SNYK-CC-00171
resource "aws_security_group" "ecs" {
  name        = "streamflix-${var.environment}-ecs"
  description = "ECS tasks: allow from ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "streamflix-${var.environment}-ecs-sg" }
}

# tfsec:ignore:aws-ec2-no-public-egress-sgr
# snyk:ignore:SNYK-CC-TF-73
# snyk:ignore:SNYK-CC-00171
resource "aws_security_group" "db" {
  name        = "streamflix-${var.environment}-db"
  description = "RDS: allow from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "streamflix-${var.environment}-db-sg" }
}

# tfsec:ignore:aws-ec2-no-public-egress-sgr
# snyk:ignore:SNYK-CC-TF-73
# snyk:ignore:SNYK-CC-00171
resource "aws_security_group" "cache" {
  name        = "streamflix-${var.environment}-cache"
  description = "ElastiCache Redis: allow from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "streamflix-${var.environment}-cache-sg" }
}

# tfsec:ignore:aws-ec2-no-public-egress-sgr
# snyk:ignore:SNYK-CC-TF-73
# snyk:ignore:SNYK-CC-00171
resource "aws_security_group" "msk" {
  name        = "streamflix-${var.environment}-msk"
  description = "MSK Kafka: allow from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
    description     = "Kafka TLS"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "streamflix-${var.environment}-msk-sg" }
}

# ─── VPC Flow Logs ───────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/streamflix-${var.environment}"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn
}

resource "aws_iam_role" "vpc_flow_logs" {
  name = "streamflix-${var.environment}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  role = aws_iam_role.vpc_flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"]
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.vpc_flow_logs.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow_logs.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}
