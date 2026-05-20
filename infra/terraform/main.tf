terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "streamflix-terraform-state"
    key            = "streamflix/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "streamflix-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "streamflix"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# DR standby provider
provider "aws" {
  alias  = "dr"
  region = var.dr_region

  default_tags {
    tags = {
      Project     = "streamflix"
      Environment = var.environment
      ManagedBy   = "terraform"
      Role        = "dr"
    }
  }
}

# ─── Modules ─────────────────────────────────────────────────────────────────

module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
  aws_region  = var.aws_region
  vpc_cidr    = var.vpc_cidr
}

module "ecr" {
  source      = "./modules/ecr"
  environment = var.environment
  services    = ["auth", "catalog", "playback", "user", "recommendation"]
}

module "rds" {
  source              = "./modules/rds"
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  db_security_group_id = module.vpc.db_security_group_id
  db_password         = var.db_password
  instance_class      = var.rds_instance_class
}

module "elasticache" {
  source               = "./modules/elasticache"
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  cache_security_group_id = module.vpc.cache_security_group_id
  node_type            = var.elasticache_node_type
}

module "dynamodb" {
  source      = "./modules/dynamodb"
  environment = var.environment
  dr_region   = var.dr_region
}

module "msk" {
  source               = "./modules/msk"
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  msk_security_group_id = module.vpc.msk_security_group_id
  broker_instance_type = var.msk_broker_instance_type
}

module "s3" {
  source      = "./modules/s3"
  environment = var.environment
}

module "cloudfront" {
  source                 = "./modules/cloudfront"
  environment            = var.environment
  media_bucket_domain    = module.s3.media_bucket_regional_domain
  assets_bucket_domain   = module.s3.assets_bucket_regional_domain
  alb_dns_name           = module.ecs.alb_dns_name
  cloudfront_price_class = var.cloudfront_price_class
  waf_acl_arn            = module.ecs.waf_acl_arn
}

module "ecs" {
  source                  = "./modules/ecs"
  environment             = var.environment
  aws_region              = var.aws_region
  vpc_id                  = module.vpc.vpc_id
  public_subnet_ids       = module.vpc.public_subnet_ids
  private_subnet_ids      = module.vpc.private_subnet_ids
  alb_security_group_id   = module.vpc.alb_security_group_id
  ecs_security_group_id   = module.vpc.ecs_security_group_id
  ecr_registry            = module.ecr.registry_url
  image_tag               = var.image_tag
  db_secret_arn           = module.rds.secret_arn
  redis_endpoint          = module.elasticache.primary_endpoint
  kafka_brokers           = module.msk.bootstrap_brokers_tls
  media_bucket            = module.s3.media_bucket_name
  assets_bucket           = module.s3.assets_bucket_name
  cloudfront_domain       = module.cloudfront.media_domain
  cloudfront_key_pair_id  = var.cloudfront_key_pair_id
  stripe_secret_arn       = var.stripe_secret_arn
  anthropic_api_key_arn   = var.anthropic_api_key_arn
  desired_count           = var.ecs_desired_count
}

module "route53" {
  source               = "./modules/route53"
  environment          = var.environment
  domain_name          = var.domain_name
  alb_dns_name         = module.ecs.alb_dns_name
  alb_zone_id          = module.ecs.alb_zone_id
  cloudfront_domain    = module.cloudfront.media_domain
  cloudfront_zone_id   = module.cloudfront.cloudfront_zone_id
}
