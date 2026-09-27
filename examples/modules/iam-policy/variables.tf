variable "name" {
  description = "Name assigned to the customer-managed IAM policy."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,128}$", var.name))
    error_message = "name must be a valid IAM policy name of at most 128 characters."
  }
}

variable "description" {
  description = "Human-readable purpose of the IAM policy."
  type        = string

  validation {
    condition     = length(trimspace(var.description)) >= 10
    error_message = "description must contain at least 10 characters."
  }
}

variable "policy_statements" {
  description = "IAM policy statements rendered into the managed policy."
  type = list(object({
    sid       = optional(string)
    effect    = string
    actions   = list(string)
    resources = list(string)
  }))

  validation {
    condition = length(var.policy_statements) > 0 && alltrue([
      for statement in var.policy_statements :
      contains(["Allow", "Deny"], statement.effect) &&
      length(statement.actions) > 0 &&
      length(statement.resources) > 0
    ])
    error_message = "At least one Allow or Deny statement with actions and resources is required."
  }
}

variable "tags" {
  description = "Tags applied to the IAM policy."
  type        = map(string)
  default     = {}
}
