output "cluster_arn"  { value = aws_ecs_cluster.main.arn }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "alb_dns_name" { value = aws_lb.main.dns_name }
output "alb_zone_id"  { value = aws_lb.main.zone_id }
output "waf_acl_arn"  { value = "" }
