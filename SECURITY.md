# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Email: **security@vitamem.dev**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigations (optional)

Expect an acknowledgement within 48 hours and a resolution timeline within 7 days.

## Health Data Considerations

Vitamem is a developer library. Applications built with Vitamem that handle Protected Health Information (PHI) are responsible for their own compliance, including encrypting data at rest and in transit, access controls, and audit logs.

Vitamem itself does not transmit data to any third-party service — all data flows are determined by the adapters you configure.
