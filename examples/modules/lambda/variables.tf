variable "function_name" {
  description = "Name assigned to the Lambda function."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,64}$", var.function_name))
    error_message = "function_name must contain 1-64 letters, numbers, hyphens, or underscores."
  }
}

variable "role_arn" {
  description = "IAM role ARN assumed by the Lambda function."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:role/.+$", var.role_arn))
    error_message = "role_arn must be an AWS IAM role ARN."
  }
}

variable "image_uri" {
  description = "Tagged container image URI used by the Lambda function."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$", var.image_uri))
    error_message = "image_uri must include an explicit image tag."
  }
}

variable "architecture" {
  description = "Instruction-set architecture used by the Lambda function."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.architecture)
    error_message = "architecture must be arm64 or x86_64."
  }
}

variable "memory_size" {
  description = "Memory allocated to the Lambda function in MiB."
  type        = number
  default     = 512

  validation {
    condition     = var.memory_size >= 128 && var.memory_size <= 10240
    error_message = "memory_size must be between 128 and 10240 MiB."
  }
}

variable "timeout" {
  description = "Maximum Lambda invocation duration in seconds."
  type        = number
  default     = 15

  validation {
    condition     = var.timeout >= 1 && var.timeout <= 900
    error_message = "timeout must be between 1 and 900 seconds."
  }
}

variable "environment_variables" {
  description = "Non-secret environment variables supplied to the function."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for name in keys(var.environment_variables) :
      can(regex("^[A-Za-z][A-Za-z0-9_]+$", name))
    ])
    error_message = "Environment variable names must start with a letter and contain only letters, numbers, or underscores."
  }
}

variable "tags" {
  description = "Tags applied to the Lambda function."
  type        = map(string)
  default     = {}
}
