output "registry_url" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com"
}

output "repository_urls" {
  value = { for k, v in aws_ecr_repository.service : k => v.repository_url }
}
