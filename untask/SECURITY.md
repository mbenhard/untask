# Security Policy

## Supported Versions

Only the latest release is supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. Email the maintainers (address listed in the project README)
2. Do not open a public GitHub issue for security vulnerabilities

### What to include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

### Response timeline

We will do our best to respond within 7 days and provide a fix or mitigation plan within 30 days.

## Security Design

- **API keys** are stored in the OS keychain via Electron safeStorage (macOS Keychain). Keys never touch the renderer process.
- **Zero telemetry.** No data is sent to any server. Everything stays on your device.
- **Backups** automatically strip API keys before export.
- **DevTools** are disabled in production builds.
- **Sandbox** is enabled with context isolation and no Node integration in the renderer.
