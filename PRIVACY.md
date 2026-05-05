# Privacy Policy

Effective date: May 6, 2026

This Privacy Policy explains how AMoon Eclipse handles information in the web, mobile, desktop, and self-hosted versions of the app.

This document is a practical project policy template, not legal advice. If you operate AMoon Eclipse as a public service, review this policy with qualified legal counsel and adapt it to your actual deployment.

## 1. Summary

AMoon Eclipse is designed as an end-to-end encrypted messenger. Message plaintext is encrypted on the client before it reaches the server.

The server is not designed to read message plaintext. It still processes account information, public keys, encrypted message bundles, metadata, and security logs needed to provide the service.

## 2. Information We Process

Depending on how the service is configured, AMoon Eclipse may process:

- account identifiers, such as user ID and username
- email address for account recovery or notifications
- password hashes, not plaintext passwords
- public encryption keys and fingerprints
- encrypted private-key backup data, if you enable passphrase recovery
- encrypted message bundles and attachment references
- room, group, membership, friend, block, moderation, and pending-message metadata
- OAuth account identifiers if you use third-party sign-in
- TOTP configuration status if you enable two-factor authentication
- IP address, user agent, timestamps, request paths, and security events in server logs
- crash, diagnostic, or abuse-prevention data if enabled by the deployment

## 3. Message Content

Message plaintext is encrypted on your device using client-side encryption before transmission.

The server stores and forwards encrypted message bundles. Server operators may still see metadata required for delivery, such as sender ID, room ID, recipient membership, timestamps, public keys, and message size.

If you lose your private key or recovery passphrase, encrypted messages may not be recoverable.

## 4. How We Use Information

We use information to:

- create and authenticate accounts
- deliver encrypted messages and realtime events
- manage rooms, friends, pending requests, blocking, moderation, and profile features
- provide account recovery and security features
- prevent spam, abuse, scanning, and attacks
- debug, maintain, and improve the service
- comply with legal obligations when required

## 5. Sharing

We do not sell message content or account data.

Information may be shared only when needed for:

- hosting, database, email, OAuth, TURN, security, or infrastructure providers
- legal compliance or valid legal process
- protecting users, the service, or the public from abuse or security threats
- self-hosted deployments operated by third parties, where that operator controls its own data handling

## 6. Data Retention

Retention depends on the deployment configuration.

Typical data may be kept as follows:

- account data: while the account exists
- encrypted messages and metadata: while needed for message history and delivery
- security logs: for a limited period needed for abuse prevention and debugging
- deleted or expired content: removed according to server configuration and backup limits

Backups, logs, and federated or third-party copies may take additional time to expire.

## 7. Your Choices

Depending on the deployment, you may be able to:

- update your profile information
- change your password
- enable or disable two-factor authentication
- rotate or recreate encryption keys
- block users
- delete local app data from your device
- request account deletion from the service operator

For self-hosted instances, contact the operator of that instance.

## 8. Security

AMoon Eclipse uses technical controls such as end-to-end encryption, password hashing, field-level encryption for selected server-side data, rate limits, security headers, and scanner-abuse detection.

No system is perfectly secure. You should keep your devices updated, protect your credentials, and store recovery passphrases safely.

## 9. Children

AMoon Eclipse is not intended for children under 13 or for users under the minimum age required by local law.

Do not use the service if you are not old enough to consent to these terms in your jurisdiction.

## 10. International Use

If you use or host AMoon Eclipse across regions, your information may be processed in countries where the server, database, or infrastructure providers operate.

Self-hosted operators are responsible for their own regional compliance obligations.

## 11. Changes

We may update this Privacy Policy when the app, service, or data practices change. Continued use after changes means you accept the updated policy.

## 12. Contact

For privacy questions, security concerns, or account requests, contact the maintainers through the GitHub repository or the official contact channel published with your deployment.
