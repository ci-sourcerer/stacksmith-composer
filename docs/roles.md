# Roles and access

Stacksmith Platform combines scoped roles with workload access. GitHub repository access is also required. Platform Admins are configured in deployment settings; only Admins assign stack roles in Admin settings.

| Capability | Admin | Stack provisioner | Stack runner | Stack viewer |
| --- | --- | --- | --- | --- |
| Read stacks and authorized environment results | All | Assigned scope | Assigned scope | Assigned scope |
| Plan and request execution | Both workloads | Selected workloads | Selected workloads | No |
| Approve execution and authorize PR runs | Both workloads | Selected workloads | No | No |
| Reconcile uncertain runs | Both workloads | Selected workloads | No | No |
| Manage environment settings and credentials | All | Assigned scope | No | No |
| Edit shared configuration and author Composer changes | All | Repository-wide assignments | No | No |
| Manage roles and platform configuration | Yes | No | No | No |

Assignments cover one repository and either every environment or one named environment. Viewer assignments have no execution workloads. Runner and Provisioner assignments select Infrastructure, Operations, or both. Mixed runs require access to every selected workload, including approval and cancellation. Read access covers all run types within the assigned environment.

Assignments add permissions; a narrower assignment does not remove a repository-wide grant. Workload permissions remain tied to the role that grants them. For example, an Operations Provisioner and an environment-specific Infrastructure Runner can approve operations and request infrastructure execution, but cannot approve infrastructure execution.

Repository-wide Provisioners can author Composer PRs and change shared configuration. Environment-specific Provisioners can manage that environment's deployment settings and credentials. Composer PR creation also requires GitHub push access. Self-approval is allowed for Provisioners and Admins with matching workload access. Explicit commit overrides and local-backend testing remain Admin-only.

Stack settings contains scoped deployment, configuration, and credential controls. The Admin settings tab is aligned to the right and contains platform configuration, registration, health, and role assignments. Unavailable actions are hidden or disabled, and the API independently checks every protected request.

GitHub-triggered runs use the triggering user's or bot's role and workloads, just like manual requests. PR authorization and deployment approval require a matching Provisioner or Admin. Assign explicit roles to automation bot logins when needed.

The worker rechecks the requester's and relevant authorizer's or approver's current role before starting each new phase. If access has been revoked, remaining phases are cancelled and the audit history records the reason. An already-launched phase finishes and is reconciled normally; completed changes are retained. Uncertain execution still requires reconciliation before its deployment lock is released.

This role model uses fresh assignment storage. Legacy custom capability grants are not honored, and legacy API tokens must be recreated. Existing run history and artifacts are retained.
