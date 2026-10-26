variable "name" {
  description = "Environment-qualified service name."
  type        = string
}

variable "environment" {
  description = "Deployment environment: staging or production."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "vpc_cidr" {
  description = "CIDR reserved for this isolated environment."
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class selected after cost and capacity review."
  type        = string
}

variable "db_allocated_storage_gb" {
  description = "Initial encrypted RDS storage in GiB."
  type        = number
}

variable "db_max_allocated_storage_gb" {
  description = "RDS autoscaling ceiling in GiB."
  type        = number
}

variable "db_multi_az" {
  description = "Whether RDS uses a Multi-AZ deployment."
  type        = bool
}

variable "db_backup_retention_days" {
  description = "Automated backup retention selected from the recovery contract."
  type        = number
}

variable "deletion_protection" {
  description = "Protect stateful resources from accidental deletion."
  type        = bool
}

variable "queue_retention_seconds" {
  description = "Queue retention selected from the maximum recovery period."
  type        = number
}

variable "log_retention_days" {
  description = "CloudWatch log retention approved for the environment."
  type        = number
}

variable "monthly_budget_usd" {
  description = "Approved monthly cost ceiling. Null leaves the budget gate unresolved."
  type        = number
  default     = null
  nullable    = true
}

variable "budget_alert_email" {
  description = "Named billing owner destination. Null leaves budget notifications disabled."
  type        = string
  default     = null
  nullable    = true
}

variable "operations_alert_email" {
  description = "Named operations owner destination. Null creates no email subscription."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Required ownership and cost-allocation tags."
  type        = map(string)
}

