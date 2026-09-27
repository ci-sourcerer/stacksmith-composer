output "endpoint" {
  description = "Illustrative database endpoint for composing references."
  value       = "postgresql://${var.name}.example.invalid:5432"
}
