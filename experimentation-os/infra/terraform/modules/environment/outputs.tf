output "vpc_id" {
  value = aws_vpc.this.id
}

output "application_security_group_id" {
  value = aws_security_group.application.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "database_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "database_master_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

output "event_queue_url" {
  value = aws_sqs_queue.events.url
}

output "dead_letter_queue_url" {
  value = aws_sqs_queue.events_dlq.url
}

output "runtime_role_arn" {
  value = aws_iam_role.runtime.arn
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

