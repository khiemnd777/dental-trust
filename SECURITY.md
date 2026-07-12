# Security policy

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability. Contact the private security owner designated by the DENTAL TRUST organization and include:

- affected version/commit and environment;
- concise impact and prerequisite conditions;
- safe reproduction steps or proof without real patient data;
- relevant request/correlation IDs with secrets removed;
- any known active exploitation or disclosure deadline.

Do not access data beyond what is necessary to demonstrate the issue, create persistent accounts, disrupt service, download private records, test production payment methods, or expose the report to third parties. The security owner will acknowledge, triage severity, coordinate remediation/disclosure, and provide a secure channel for additional evidence.

If no private security contact has been configured for a deployment, production launch is blocked until one is published through an organization-controlled channel.

## Supported versions

Only the currently deployed production release and the immediately preceding rollback release receive security fixes. Older development builds are unsupported. Critical/high defects block release and are patched in the newest release line; deployment owners decide any coordinated backport.

## Handling sensitive material

Never place credentials, session tokens, patient/clinic documents, database exports, signed object URLs, payment payloads, encryption keys, or private vulnerability details in Git history, public trackers, ordinary email, or chat. Use approved encrypted evidence storage with minimum access and expiry.

Architecture controls and response procedures are documented in [docs/SECURITY.md](docs/SECURITY.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), and [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md).
