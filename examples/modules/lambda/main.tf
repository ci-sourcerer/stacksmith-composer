resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = var.role_arn
  package_type  = "Image"
  image_uri     = var.image_uri
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout
  tags          = var.tags

  environment {
    variables = var.environment_variables
  }

  tracing_config {
    mode = "Active"
  }
}
