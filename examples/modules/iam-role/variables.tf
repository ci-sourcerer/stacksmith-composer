variable "role_name" {
  description = "Name assigned to the IAM role."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,64}$", var.role_name))
    error_message = "role_name must be a valid IAM role name of at most 64 characters."
  }
}

variable "trusted_service" {
  description = "AWS service principal allowed to assume the role."
  type        = string
  default     = "lambda.amazonaws.com"

  validation {
    condition     = can(regex("^[a-z0-9-]+\\.amazonaws\\.com$", var.trusted_service))
    error_message = "trusted_service must be an AWS service principal."
  }
}

variable "policy_arns" {
  description = "Managed policy ARNs attached to the role."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for arn in var.policy_arns :
      can(regex("^arn:aws[a-z-]*:iam::(aws|[0-9]{12}):policy/.+$", arn))
    ])
    error_message = "Every policy_arns value must be an IAM managed-policy ARN."
  }
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
