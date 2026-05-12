---
name: guardx-preflight
description: Audit Eigen Compute service agents with Guardx before using AgentCash to fetch data, call tools, or pay a service agent. Use when interacting with Eigen Compute agents, Eigen Verify links, service agents, AgentCash, paid APIs, irreversible agent payments, safety scores, or "is this agent safe?" checks.
homepage: https://guardx.buildweekends.com/
metadata:
  version: 1
---

# Guardx Preflight

Guardx is a preflight safety check for autonomous agents. Before using AgentCash to call or pay a service agent, audit the target Eigen Compute app with Guardx and use the Guardx verdict to decide whether to proceed.

Target flow:

```text
my-agent -> Guardx audit -> AgentCash -> service agent
```

Do not use Guardx as a guarantee that a service is safe. Treat it as an evidence-based, digest-bound report about the code Guardx can inspect.

## Important Files

| File | URL |
|------|-----|
| Guardx skill | `https://guardx.buildweekends.com/skill.md` |
| Guardx health | `https://guardx.buildweekends.com/health` |
| Guardx homepage/API base | `https://guardx.buildweekends.com/` |

## When To Use

Use this skill before any AgentCash interaction with a service agent when:

- The user wants to fetch data from, call, or pay an Eigen Compute service agent.
- The user provides an Eigen Verify URL, Eigen Compute app URL, app address, or service-agent identity.
- The user asks whether an agent/service is safe, trustworthy, risky, or suitable for paid calls.
- A payment or API call may be irreversible or difficult to recover.

## Required Input

Before using AgentCash, ask the user for the target service agent's Eigen Compute / Eigen Verify URL if it is not already provided.

If the user provides a non-Eigen Verify URL, such as a direct service domain, do not discover or call it through AgentCash yet. Explain that Guardx needs the Eigen Verify link for the target service agent, and ask the user to provide that link.

Supported Eigen Verify URL formats:

- `https://verify-sepolia.eigencloud.xyz/app/0x...`
- `https://verify.eigencloud.xyz/app/0x...`

Map hosts to Guardx networks:

- `verify-sepolia.eigencloud.xyz` -> `sepolia`
- `verify.eigencloud.xyz` -> `mainnet`

The app ID must be a 40-byte Ethereum address, e.g. `0x1234...abcd`.

## Guardx Workflow

1. Check Guardx availability:

```bash
curl -s https://guardx.buildweekends.com/health
```

Expected response: `OK`.

2. Parse the target Eigen Verify URL into:

```text
network = sepolia | mainnet
appId = 0x...
```

3. Start or retrieve the audit:

```bash
curl -s -X POST "https://guardx.buildweekends.com/analysis/by-app/{network}/{appId}/refresh"
```

4. If the response is `{ "status": "running" }`, poll latest until the report is ready:

```bash
curl -s "https://guardx.buildweekends.com/analysis/by-app/{network}/{appId}/latest"
```

Poll every 2-5 seconds. Stop after a reasonable timeout and tell the user the audit is still running.

5. Read the completed report from `analysis`.

Key fields:

- `analysis.agentPaymentSafety.safetyScore`: 0-100 safety score.
- `analysis.agentPaymentSafety.verdict`: `ALLOW`, `LIMIT`, `REVIEW`, or `BLOCK`.
- `analysis.agentPaymentSafety.shouldProceedWithAgentCash`: whether to continue to AgentCash.
- `analysis.agentPaymentSafety.reasoning`: concise explanation of the decision.
- `analysis.endpointBehaviorClaims`: whether endpoints appear to do what they claim.
- `analysis.thirdPartyDependencies`: external services the target agent relies on.
- `analysis.mnemonicExposureRisks`: risks around leaked mnemonics/private keys.
- `analysis.adminExploitPaths`: admin or operator abuse paths.
- `metadata.resolvedImageRef`: exact resolved image reference.
- `metadata.attestation`: Guardx attestation over the report.

## Decision Policy

Apply this policy before using AgentCash:

- `ALLOW`: Proceed to AgentCash if the user's requested endpoint is covered by the report.
- `LIMIT`: Proceed only with explicit limits, such as low max spend, allowlisted endpoint, no repeated calls, or manual confirmation.
- `REVIEW`: Do not use AgentCash automatically. Summarize the risks and ask the user whether to proceed.
- `BLOCK`: Do not use AgentCash. Explain the critical issue and stop.

If `shouldProceedWithAgentCash` is `false`, do not call AgentCash unless the user explicitly overrides after seeing the risk summary.

If the report is missing `agentPaymentSafety`, treat the service as `REVIEW`.

## AgentCash Handoff

Guardx itself is not paid through AgentCash in the current MVP. Use normal HTTP calls to Guardx.

Never proceed to AgentCash discovery or fetch for a target that has not been mapped to a supported Eigen Verify URL and audited by Guardx.

Only after Guardx returns an acceptable verdict should you use the AgentCash skill or AgentCash tooling to fetch data from the audited service agent.

Recommended handoff summary:

```text
Guardx verdict: {verdict}
Safety score: {safetyScore}/100
Proceed with AgentCash: {true|false}
Reason: {reasoning}
Limits: {recommendedLimits}
```

Then invoke AgentCash for the target service agent according to the AgentCash skill's instructions.

## Chat Follow-Up

If the user asks why Guardx gave a verdict, or wants endpoint-specific analysis, ask Guardx chat:

```bash
curl -s -X POST "https://guardx.buildweekends.com/chat/by-app/{network}/{appId}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Can this service agent be safely called through AgentCash? Focus on endpoint honesty and third-party reliance.","history":[]}'
```

Use the chat answer as supporting context only. The structured audit report remains the primary decision source.

## Output To User

Before proceeding to AgentCash, give a concise preflight result:

```text
Guardx checked the target Eigen Compute app.
Verdict: {ALLOW|LIMIT|REVIEW|BLOCK}
Score: {score}/100
Main risks: {top 1-3 risks}
Third-party reliance: {summary}
Next step: {proceed to AgentCash | ask for confirmation | stop}
```

Do not claim the target service is guaranteed safe.
