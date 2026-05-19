output "writer_endpoint" { value = aws_rds_cluster.main.endpoint; sensitive = true }
output "reader_endpoint" { value = aws_rds_cluster.main.reader_endpoint; sensitive = true }
output "secret_arn"      { value = aws_secretsmanager_secret.db.arn }
output "cluster_id"      { value = aws_rds_cluster.main.cluster_identifier }
