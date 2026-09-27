variable "name" {
  description = "Name of the example database."
  type        = string
}
variable "network_id" {
  description = "Network supplied by a managed association."
  type        = string
  default     = null
}
