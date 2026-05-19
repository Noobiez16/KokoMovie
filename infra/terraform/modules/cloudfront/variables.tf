variable "environment"            { type = string }
variable "media_bucket_domain"    { type = string }
variable "assets_bucket_domain"   { type = string }
variable "alb_dns_name"           { type = string }
variable "cloudfront_price_class" { type = string }
variable "waf_acl_arn"            { type = string; default = "" }
