variable "policy_arn" {
  description = "ARN of an existing AWS-managed IAM policy."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:iam::aws:policy/.+$", var.policy_arn))
    error_message = "policy_arn must identify an AWS-managed IAM policy."
  }
}
