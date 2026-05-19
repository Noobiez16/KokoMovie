resource "aws_msk_cluster" "main" {
  cluster_name           = "streamflix-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    client_subnets  = var.private_subnet_ids
    security_groups = [var.msk_security_group_id]
    storage_info {
      ebs_storage_info {
        volume_size = 100
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
        }
      }
    }
  }

  client_authentication {
    sasl {
      iam = true
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  open_monitoring {
    prometheus {
      jmx_exporter  { enabled_in_broker = true }
      node_exporter { enabled_in_broker = true }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/msk/streamflix-${var.environment}"
      }
    }
  }

  tags = { Name = "streamflix-${var.environment}-msk" }
}

resource "aws_msk_configuration" "main" {
  name = "streamflix-${var.environment}"
  kafka_versions = ["3.6.0"]
  server_properties = <<-PROPS
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.io.threads=8
    num.network.threads=5
    num.partitions=6
    num.replica.fetchers=2
    replica.lag.time.max.ms=30000
    socket.receive.buffer.bytes=102400
    socket.request.max.bytes=104857600
    socket.send.buffer.bytes=102400
    unclean.leader.election.enable=false
    log.retention.hours=168
    log.segment.bytes=1073741824
    log.retention.check.interval.ms=300000
  PROPS
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/msk/streamflix-${var.environment}"
  retention_in_days = 7
}

# Topics
resource "aws_msk_topic" "topics" {
  for_each = {
    "playback.events"  = { partitions = 12, retention_ms = 604800000 }  # 7d
    "user.actions"     = { partitions = 6, retention_ms = 604800000 }
    "billing.webhooks" = { partitions = 3, retention_ms = 2592000000 }  # 30d
    "content.ingested" = { partitions = 3, retention_ms = 259200000 }   # 3d
  }

  cluster_arn        = aws_msk_cluster.main.arn
  name               = each.key
  partitions         = each.value.partitions
  replication_factor = 3

  config = {
    "retention.ms"    = tostring(each.value.retention_ms)
    "min.insync.replicas" = "2"
  }
}
