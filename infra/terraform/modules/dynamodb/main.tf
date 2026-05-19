locals {
  tables = {
    watchlists = {
      hash_key  = "profileId"
      range_key = "contentId"
      attributes = [
        { name = "profileId", type = "S" },
        { name = "contentId", type = "S" },
      ]
      gsi = [{
        name            = "contentId-index"
        hash_key        = "contentId"
        projection_type = "ALL"
      }]
      ttl = null
    }
    viewing_history = {
      hash_key  = "profileId"
      range_key = "watchedAtContentId"
      attributes = [
        { name = "profileId", type = "S" },
        { name = "watchedAtContentId", type = "S" },
      ]
      gsi = []
      ttl = "ttl"
    }
    playback_sessions = {
      hash_key  = "sessionId"
      range_key = null
      attributes = [
        { name = "sessionId", type = "S" },
      ]
      gsi = []
      ttl = "ttl"
    }
    playback_positions = {
      hash_key  = "profileId"
      range_key = "contentKey"
      attributes = [
        { name = "profileId", type = "S" },
        { name = "contentKey", type = "S" },
      ]
      gsi = []
      ttl = "ttl"
    }
    ab_experiments = {
      hash_key  = "experimentId"
      range_key = null
      attributes = [
        { name = "experimentId", type = "S" },
      ]
      gsi = []
      ttl = null
    }
    ab_assignments = {
      hash_key  = "profileId"
      range_key = "experimentId"
      attributes = [
        { name = "profileId", type = "S" },
        { name = "experimentId", type = "S" },
      ]
      gsi = []
      ttl = null
    }
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each     = local.tables
  name         = "streamflix-${var.environment}-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  dynamic "attribute" {
    for_each = each.value.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.gsi
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      projection_type = global_secondary_index.value.projection_type
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl != null ? [each.value.ttl] : []
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  point_in_time_recovery {
    enabled = var.environment == "production"
  }

  # Enable Global Tables for DR
  stream_enabled   = var.environment == "production"
  stream_view_type = var.environment == "production" ? "NEW_AND_OLD_IMAGES" : null

  tags = { Table = each.key }
}
