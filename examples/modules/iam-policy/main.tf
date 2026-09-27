resource "aws_iam_policy" "this" {
  name        = var.name
  description = var.description
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      for statement in var.policy_statements : {
        Sid      = statement.sid
        Effect   = statement.effect
        Action   = statement.actions
        Resource = statement.resources
      }
    ]
  })
  tags = var.tags
}
