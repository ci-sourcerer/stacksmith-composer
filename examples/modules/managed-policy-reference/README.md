# AWS-managed policy reference

Exposes a validated AWS-managed IAM policy ARN for explicit Composer connections.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.8.0 |

## Providers

No providers.

## Modules

No modules.

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_policy_arn"></a> [policy\_arn](#input\_policy\_arn) | ARN of an existing AWS-managed IAM policy. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_arn"></a> [arn](#output\_arn) | Validated AWS-managed IAM policy ARN. |
<!-- END_TF_DOCS -->
