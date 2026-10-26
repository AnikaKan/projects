variable "aws_region" {
  type        = string
  description = "Authorized AWS region."
}

variable "state_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for encrypted Terraform state."
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/name form allowed to request short-lived deployment credentials."
}

variable "tags" {
  type        = map(string)
  description = "Required ownership and cost-allocation tags."
}

