# Guardx: A Preflight Safety Layer for Agentic Payments

Agentic payments are moving quickly. With protocols like x402, MPP, and tools such as AgentCash, agents can now discover services, pay for API access, and fetch data without a human manually checking every transaction.

That is powerful, but it also creates a new trust problem.

If one machine pays another machine, how does the payer know the service is safe? How does it know the endpoint will return what it claims? How does it know the service is not leaking secrets, relying on fragile third parties, or exposing admin functions that could change the outcome after payment?

This is where Guardx fits.

Guardx is a preflight guardrail for agents running on Eigen Compute. Before an agent uses AgentCash to call or pay another service agent, Guardx audits the target Eigen Compute deployment, produces a structured safety report, and gives the calling agent a clear decision: `ALLOW`, `LIMIT`, `REVIEW`, or `BLOCK`.

The intended flow is simple:

```text
my-agent -> Guardx audit -> AgentCash -> service agent
```

Guardx does not claim that a service is guaranteed safe. Instead, it gives agents something they do not usually have before making an irreversible payment: evidence.

## The Problem: Payments Are Easy, Trust Is Not

AgentCash makes it easy for agents to access paid services. A service can expose an endpoint, advertise a price, and let an agent pay per request. This is the right direction for machine-to-machine commerce.

But there is a missing step before payment.

When a human uses a paid API, they can read docs, inspect reputation, maybe test a free endpoint, and decide whether to trust it. When an autonomous agent pays another autonomous service, that judgment needs to become machine-readable.

The hard questions are:

- Does the service return the data it says it returns?
- Does the code match the public docs?
- Are user-selected parameters actually respected?
- Does the service rely on OpenAI, RPC providers, webhooks, or other third parties?
- Does it expose mnemonics, private keys, or sensitive environment variables?
- Can an admin sweep funds, alter behavior, or trigger privileged actions?
- Should another agent proceed with payment, proceed with limits, ask for review, or block?

Guardx turns those questions into an audit report that another agent can consume before invoking AgentCash.

## What Guardx Audits

Guardx starts from an Eigen Verify URL, resolves the target Eigen Compute app to its Docker image, extracts the application code, and runs an AI-assisted security analysis over the actual deployed artifact.

The current Guardx report focuses on:

- **Agent payment safety**: a 0-100 score and `ALLOW`, `LIMIT`, `REVIEW`, or `BLOCK` verdict.
- **Endpoint honesty**: whether endpoints appear to do what they claim.
- **Third-party reliance**: what external services the app depends on and what happens if they fail or lie.
- **Mnemonic and wallet safety**: whether secrets or TEE-injected mnemonics can leak.
- **Admin exploit paths**: whether operators or public callers can trigger sensitive behavior.
- **Environment variable inventory**: which secrets and configuration values the code uses.
- **Attestation metadata**: the resolved image and signed Guardx report metadata.

The Guardx skill for other agents is exposed at:

```text
https://guardx.buildweekends.com/skill.md
```

That skill instructs agents to ask for the target Eigen Compute / Eigen Verify URL before using AgentCash. If the user only provides a direct service URL, the agent must pause and ask for the Eigen Verify link first.

## Case Study: A Paid Mnemonic Hunt Service

To test the value of Guardx, we ran two agent sessions against the same paid service. The full transcripts of both sessions are available here:

- [before_guardx.md](https://github.com/AvinashNayak27/guardx/blob/main/before_guardx.md) — the agent paid first, then discovered the issue.
- [after_guardx.md](https://github.com/AvinashNayak27/guardx/blob/main/after_guardx.md) — the agent ran a Guardx preflight and blocked the payment.

The service was a “Mnemonic Hunt” API. It exposed docs at a direct IP address and advertised a game where users pay for image clues related to words in a 24-word mnemonic. The mnemonic controls a prize wallet. Users can request clues for specific word indices and pay through x402/MPP via AgentCash.

At first glance, the service looked like a normal paid API:

- `GET /health` for health checks
- `GET /wallet` for the prize wallet address and balance
- `GET /pricing` for clue prices
- `GET /api/clues?indices=1,2,3` as the paid endpoint
- `POST /admin/sweep` in the docs
- `GET /openapi.json` for discovery

The key question was not whether the service accepted payment. It did.

The question was whether another agent should pay it.

## Before Guardx: The Agent Paid First

In the first session, there was no Guardx preflight. The agent inspected the service docs, checked pricing and wallet information, then used AgentCash to fetch clues for ten random indices. The full transcript is in [before_guardx.md](https://github.com/AvinashNayak27/guardx/blob/main/before_guardx.md).

The selected indices were:

```text
3, 6, 8, 11, 14, 17, 19, 20, 22, 24
```

The service charged:

```text
$0.16 USDC on Tempo
```

The transaction succeeded:

```text
0xa9730422e0d330f441d7f83beb161e0695ddbe8c53c79731fe5d02a12d6e88dd
```

Only after payment did the agent discover the problem.

The returned indices were:

```text
1, 2, 3, 5, 6, 11, 14, 19, 21, 23
```

The requested and returned indices did not match. Only five of the ten requested indices overlapped.

That is exactly the kind of failure that matters in agentic payments. The agent did not get what it asked for, but the payment had already happened. The transaction was complete, the funds were gone, and the best the agent could do was report the mismatch after the fact.

The agent summarized the issue clearly:

```text
Requested indices: 3, 6, 8, 11, 14, 17, 19, 20, 22, 24
Returned indices: 1, 2, 3, 5, 6, 11, 14, 19, 21, 23
```

The lesson from the “before” session is straightforward: without a preflight safety layer, agents can discover service dishonesty only after they have already paid.

## After Guardx: The Agent Blocked Before Payment

In the second session, the same kind of request was made, but this time the Guardx skill was active. The full transcript is in [after_guardx.md](https://github.com/AvinashNayak27/guardx/blob/main/after_guardx.md).

The user asked the agent to use AgentCash to fetch clues for ten random indices. Instead of paying immediately, the agent followed the Guardx preflight policy.

It noticed that the user had only provided the direct service URL:

```text
http://35.204.106.224:3000/
```

Guardx requires an Eigen Verify URL so it can audit the verified Eigen Compute app. The agent paused and asked for the target Eigen Verify link.

The user then provided:

```text
https://verify.eigencloud.xyz/app/0x930516a7db34d3e5528049aff58416dc79cbdcb5
```

The agent checked Guardx health:

```text
https://guardx.buildweekends.com/health -> OK
```

Then it ran the Guardx audit:

```text
POST https://guardx.buildweekends.com/analysis/by-app/mainnet/0x930516a7db34d3e5528049aff58416dc79cbdcb5/refresh
```

Guardx resolved and audited the image:

```text
docker.io/avinashnayak27/mnemonic-hunt@sha256:0bf1246...87202d94
```

The result was not a warning. It was a block.

```text
Verdict: BLOCK
Safety score: 5/100
Proceed with AgentCash: false
```

This time, no AgentCash call was made.

## What Guardx Found

Guardx surfaced several issues before the agent spent anything.

### 1. The Service Leaked Mnemonic Words to OpenAI

The paid endpoint selected words from the live 24-word mnemonic controlling the prize wallet and passed them into an OpenAI image prompt.

That means the clue-generation flow was not just revealing harmless hints. It was sending actual mnemonic material to a third-party service.

Even worse, a request for all 24 indices could potentially send the entire mnemonic to OpenAI.

For a service where the mnemonic controls the prize wallet, this is a critical failure.

### 2. The Paid Endpoint Did Not Respect Requested Indices

The service claimed users could request clues for specific indices.

But Guardx found that the handler ignored the requested indices and instead called logic equivalent to:

```text
pickRandomMnemonicIndices(selectedCount)
```

This exactly explained the mismatch observed in the first session.

Before Guardx, the agent learned this only after paying. After Guardx, the agent learned it before payment and blocked the call.

### 3. The Admin Sweep Was Unsafe

The docs described an admin sweep endpoint, but the implementation was more dangerous than expected.

Guardx reported that the sweep route was implemented as `GET`, not `POST`, checked only the date, and did not validate an admin secret.

After the unlock date, anyone could trigger a transfer of 99% of the prize wallet’s USDC to a hardcoded admin address.

For a paid service where the payment recipient is also the prize wallet, this materially changes the risk profile.

### 4. The Payment Recipient Was the Prize Wallet

The clue payments flowed into the same wallet whose mnemonic was being used to generate clues and whose funds could later be swept.

That creates a combined risk:

- The wallet receives user payments.
- The mnemonic behind that wallet is partially exposed to a third-party AI provider.
- The wallet can later be swept through an unsafe admin path.

For an autonomous paying agent, that is not just a code smell. It is a reason to stop.

## The Before/After Difference

The contrast is the product.

Before Guardx:

- The agent discovered the service docs.
- It checked the price.
- It paid through AgentCash.
- It received a large image response.
- It then noticed the service returned different indices than requested.
- The payment had already happened.

After Guardx:

- The agent refused to use AgentCash without an Eigen Verify URL.
- It ran Guardx on the verified Eigen Compute app.
- It received a `BLOCK` verdict with a 5/100 score.
- It identified mnemonic leakage, misleading endpoint behavior, unsafe admin sweep logic, and risky third-party reliance.
- It did not make the irreversible payment.

That is the shift Guardx enables: from post-payment discovery to pre-payment judgment.

## Why Eigen Compute Matters

The Guardx model works especially well with Eigen Compute because the target service is not just a random URL. It has an Eigen Verify identity.

That gives Guardx a stronger anchor:

- Resolve the app from Eigen Verify.
- Identify the deployed image.
- Extract and inspect the code artifact.
- Produce a digest-bound audit report.
- Return a verdict that another agent can act on.

This is similar in spirit to how smart contracts need auditors. The difference is that these “contracts” are service agents: offchain programs that expose APIs, use wallets, call third parties, and accept machine payments.

Eigen Compute provides verifiability around where and what is running. Guardx adds a safety layer around whether another agent should interact with it.

## Guardx as a Skill

Guardx is designed to be used by other agents through an Agent Skill.

The skill tells agents:

1. Do not go straight to AgentCash.
2. Ask for the target Eigen Verify URL.
3. Run the Guardx audit.
4. Inspect `agentPaymentSafety`.
5. Continue to AgentCash only if the verdict permits it.

The decision policy is intentionally simple:

- `ALLOW`: proceed to AgentCash if the requested endpoint is covered.
- `LIMIT`: proceed only with spend limits, endpoint allowlists, or manual confirmation.
- `REVIEW`: do not pay automatically; summarize the risks and ask the user.
- `BLOCK`: stop and do not use AgentCash.

This makes Guardx useful not only as a dashboard for humans, but as a machine-readable policy layer for agents.

## What Guardx Is Not

Guardx is not a formal proof system.

It does not guarantee that a service is safe. It does not guarantee that runtime behavior cannot change because of external state, remote APIs, environment variables, or future deployments. It also cannot verify behavior that is not present in the inspected code.

What it can do is give agents a structured, evidence-based preflight:

- What code is this?
- What endpoints does it expose?
- What do those endpoints appear to do?
- What third parties does it rely on?
- Does it expose secrets or wallet material?
- Are there admin paths or misleading payment flows?
- Should another agent proceed, limit, review, or block?

For agentic payments, that is already a major improvement over paying first and learning later.

## The Bigger Picture

As more agents start paying other agents, trust has to become programmable.

AgentCash solves a key part of the stack: giving agents a way to pay for APIs and services. Eigen Compute solves another key part: giving services a verifiable deployment identity. Guardx connects those pieces by giving the paying agent a safety decision before money moves.

The thesis is simple:

```text
If agents are going to pay agents, agents need auditors.
```

Guardx is that auditor for the Eigen Compute agent economy.

It turns a target service from “some API that wants payment” into a verified artifact with a safety score, endpoint-behavior analysis, third-party dependency map, and clear payment recommendation.

In the Mnemonic Hunt case study, that difference prevented an unnecessary payment to a service that did not return what it promised and exposed critical wallet risk.

That is the kind of guardrail autonomous commerce needs.
