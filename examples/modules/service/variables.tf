variable "name" {
  description = "Name of the example application."
  type        = string
}
variable "network_id" {
  description = "Network supplied by a managed association."
  type        = string
  default     = null
}
variable "database_url" {
  description = "Database endpoint supplied by an explicit component reference."
  type        = string
  default     = null
}
