module "environment" {
  source = "../../modules/environment"

  name                        = "experimentos-staging"
  environment                 = "staging"
  vpc_cidr                    = var.vpc_cidr
  db_instance_class           = var.db_instance_class
  db_allocated_storage_gb     = var.db_allocated_storage_gb
  db_max_allocated_storage_gb = var.db_max_allocated_storage_gb
  db_multi_az                 = var.db_multi_az
  db_backup_retention_days    = var.db_backup_retention_days
  deletion_protection         = var.deletion_protection
  queue_retention_seconds     = var.queue_retention_seconds
  log_retention_days          = var.log_retention_days
  monthly_budget_usd          = var.monthly_budget_usd
  budget_alert_email          = var.budget_alert_email
  operations_alert_email      = var.operations_alert_email
  tags                        = var.tags
}

