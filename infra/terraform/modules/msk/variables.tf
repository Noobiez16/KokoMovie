variable "environment"            { type = string }
variable "vpc_id"                 { type = string }
variable "private_subnet_ids"     { type = list(string) }
variable "msk_security_group_id"  { type = string }
variable "broker_instance_type"   { type = string }
variable "kms_key_arn"            { type = string }
