variable "aws_region" { type = string }
variable "vpc_cidr" { type = string }
variable "db_instance_class" { type = string }
variable "db_allocated_storage_gb" { type = number }
variable "db_max_allocated_storage_gb" { type = number }
variable "db_multi_az" { type = bool }
variable "db_backup_retention_days" { type = number }
variable "deletion_protection" { type = bool }
variable "queue_retention_seconds" { type = number }
variable "log_retention_days" { type = number }
variable "monthly_budget_usd" {
  type     = number
  default  = null
  nullable = true
}
variable "budget_alert_email" {
  type     = string
  default  = null
  nullable = true
}
variable "operations_alert_email" {
  type     = string
  default  = null
  nullable = true
}
variable "tags" { type = map(string) }
