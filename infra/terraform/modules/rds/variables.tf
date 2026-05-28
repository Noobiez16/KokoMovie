variable "environment"          { type = string }
variable "vpc_id"               { type = string }
variable "private_subnet_ids"   { type = list(string) }
variable "db_security_group_id" { type = string }
variable "db_password"          { type = string; sensitive = true }
variable "instance_class"       { type = string }
variable "kms_key_arn"          { type = string }
