output "arn" {
  description = "ARN of the customer-managed IAM policy."
  value       = aws_iam_policy.this.arn
}
