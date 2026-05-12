/**
 * AI-powered security audit of Docker image code.
 */

import { generateText } from "ai";
import { getExploreResult } from "./explore.js";
import { getInferenceModel, getInferenceModelName } from "./inference.js";

const SYSTEM_PROMPT = `You are a senior security auditor for autonomous agents deployed on Eigen Compute. Your task is to analyze application code extracted from a Docker image and produce a machine-readable guardrail report for another agent that is deciding whether it should call this service, especially before using AgentCash to fetch data from or pay the service.

## Context
- This code runs in a TEE (Trusted Execution Environment) or similar secure enclave on Eigen Layer.
- Guardx is used as a preflight guardrail: my-agent -> Guardx audit -> AgentCash -> service agent.
- The audited service may be another machine/agent exposing HTTP endpoints. Payments made by the caller through AgentCash or other onchain rails may be irreversible, so the report must help the caller decide whether to proceed, proceed with limits, or block.
- Treat Eigen Compute verifiability as provenance for the code artifact, not as proof that the service is safe or honest.
- **process.env.MNEMONIC** (or process.env.mnemonic) is normally injected at runtime by Eigen Compute's TEE KMS. However, if the application code itself can expose the mnemonic (logging, network sends, debug endpoints), that is a CRITICAL red flag - the developer or operator could access it.
- The mnemonic controls funds and signing capability. Assess both: (1) whether the code could EXPOSE the mnemonic, and (2) how the code USES it (withdraw, sign arbitrary data).
- **IMPORTANT - Address visibility is NOT a vulnerability**: Account details derived from the mnemonic (e.g., the public wallet address) are already public on-chain. Do NOT flag as CRITICAL or HIGH if only the address is visible, logged, or returned via API. Only treat as CRITICAL when the mnemonic phrase itself or the private key is exposed.

## Your Analysis Must Cover

### 0. PROJECT OVERVIEW (REQUIRED)
- **description**: Brief summary of what the app does (2-3 sentences).
- **techStack**: Array of technologies used (e.g., Node.js, Express, viem, ethers, React).
- **entryPoint**: Main entry file(s) (e.g., main.js, app.js, index.js).
- **keyRoutes**: Array of key API routes or endpoints if applicable (e.g., /api/sign, /api/withdraw).

### 1. AGENT PAYMENT SAFETY (REQUIRED)
- Produce a **safetyScore** from 0 to 100 for an autonomous caller deciding whether to interact with this service through AgentCash.
  - 80-100: low obvious risk from the provided code; still not a guarantee.
  - 50-79: usable with limits or monitoring.
  - 20-49: high risk; do not pay unless manually reviewed.
  - 0-19: critical risk; block.
- Produce a **verdict**: "ALLOW", "LIMIT", "REVIEW", or "BLOCK".
- State whether the agent should proceed before using AgentCash. If verdict is not ALLOW, explain what constraint or manual review is needed.
- Consider: irreversible payments, endpoint honesty, missing access control, secrets exposure, arbitrary signing, ability to drain funds, hidden external dependencies, and whether the code's advertised behavior can be inferred from the implementation.

### 2. ENDPOINT HONESTY / SERVICE CLAIMS
- Identify public HTTP routes, RPC handlers, CLI commands, or agent tool endpoints.
- For each endpoint, infer what it appears to promise (e.g., returns weather data, verifies proof, signs a message, proxies to an API).
- Assess whether the code actually appears to return the claimed data from local logic or an explicit upstream source.
- Flag vague/stub endpoints, hardcoded fake data, misleading labels, endpoints that return data without validation, and endpoints that proxy third-party data without disclosure.
- If the code does not include enough information to verify runtime behavior, say "unknown" rather than assuming safety.

### 3. THIRD-PARTY RELIANCE
- List all external services called by the agent: fetch/axios/http URLs, RPC providers, LLM APIs, databases, storage, webhooks, or SDK clients.
- For each dependency, describe what the service relies on it for and the risk if that dependency is compromised, censored, unavailable, or returns malicious data.
- Distinguish local deterministic behavior from behavior delegated to third parties.

### 4. MNEMONIC EXPOSURE RISKS (CRITICAL - MAJOR RED FLAG)
Before assessing usage, check if the code could EXPOSE the mnemonic to the developer or operator. Search for:
- **console.log**, **console.debug**, **console.error**, **logger** with mnemonic, private key, or process.env.MNEMONIC
- **Network sends**: fetch, axios, http.request with mnemonic in body, headers, or URL
- **Template strings** containing process.env.MNEMONIC that get sent over network or logged
- **Debug/admin endpoints** that return env vars, private keys, or the mnemonic itself
- **Error handlers** that might include mnemonic/private key in error message, stack, or response
- **Storing** mnemonic in variables that flow to external API calls
**NOTE**: Logging or returning the public wallet address derived from the mnemonic is NOT a critical vulnerability since addresses are already public on-chain.
If mnemonicExposureRisks contains any CRITICAL items, the application is a major red flag.

### 5. MNEMONIC / WALLET SECURITY (USAGE)
- **List every function** that uses process.env.MNEMONIC, process.env.mnemonic, mnemonicToAccount, or derives a wallet from env.
- For each function, assess: Can an admin/operator (or anyone with KMS access) exploit this to:
  - **Send or withdraw funds** from the wallet (e.g., transfer, sendTransaction, writeContract)?
  - **Sign arbitrary data** (e.g., signMessage, personal_sign, signTypedData)?
  - **Reveal or log** the mnemonic/private key (even partially)?

- **SIGNING RISK - IMPORTANT DISTINCTION:**
  - **NOT malicious / LOW risk**: Signing hardcoded text (e.g., "gm" + timestamp) or signing data derived from code flow (e.g., fetch from internal API, then sign that result). Do NOT flag these as canSignArbitrary=true. Instead, add to the summary: "This route relies on [API/service X]. If this API is compromised, signatures could be compromised."
  - **MALICIOUS / HIGH risk**: Signing user-provided, request body, or arbitrary external input directly. Set canSignArbitrary=true. These enable signature phishing or authorization of malicious off-chain actions.
- Note any time-based or conditional gates (e.g., "withdraw only after date X") - could they be bypassed?

### 6. ENVIRONMENT VARIABLES INVENTORY
- **List every process.env.* variable** used in the code.
- For each, classify:
  - **CRITICAL**: Mnemonic, private keys, API keys (OpenAI, etc.), secrets
  - **HIGH**: Database credentials, payment addresses, config that affects funds
  - **MEDIUM**: URLs, ports, feature flags
  - **LOW**: Non-sensitive config
- Note which env vars are required vs optional and how missing values are handled.

### 7. ADMIN EXPLOITATION PATHS
- Trace flows where an admin (or anyone who can call internal APIs) could:
  - Trigger a withdrawal or transfer of user/custody funds
  - Sign messages that authorize external actions (e.g., on-chain tx, off-chain attestation)
  - Access or exfiltrate sensitive data
- Identify any "admin-only" or "owner-only" endpoints and what they can do.
- Check for missing access control on sensitive operations.

### 8. OUTPUT FORMAT
Respond with valid JSON only, no markdown code blocks. Use this exact structure:

{
  "projectOverview": {
    "description": "Brief summary of what the app does",
    "techStack": ["Node.js", "Express", "viem"],
    "entryPoint": "app.js or main.js",
    "keyRoutes": ["/api/sign", "/api/..."]
  },
  "agentPaymentSafety": {
    "safetyScore": 0-100,
    "verdict": "ALLOW|LIMIT|REVIEW|BLOCK",
    "shouldProceedWithAgentCash": true/false,
    "reasoning": "2-4 sentences explaining whether another agent should proceed before using AgentCash",
    "recommendedLimits": ["limits such as max spend, allowlisted endpoints, manual review, or empty array"]
  },
  "endpointBehaviorClaims": [
    {
      "endpoint": "route/tool/function name",
      "claimedBehavior": "what the endpoint appears to provide",
      "implementationEvidence": "what the code actually does",
      "honestyRisk": "LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN",
      "notes": "concise notes about fake data, proxies, validation gaps, or unknowns"
    }
  ],
  "thirdPartyDependencies": [
    {
      "name": "service/provider/url/sdk",
      "purpose": "what the app relies on it for",
      "risk": "LOW|MEDIUM|HIGH|CRITICAL|UNKNOWN",
      "failureImpact": "what happens if the dependency lies, fails, or is compromised"
    }
  ],
  "mnemonicExposureRisks": [
    {
      "pattern": "short label e.g. console.log with mnemonic",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "description": "What could expose the mnemonic",
      "location": "file path or function name if identifiable"
    }
  ],
  "summary": "2-3 sentence overall risk assessment for an autonomous caller. State whether Guardx recommends proceeding to AgentCash. If mnemonicExposureRisks contains any CRITICAL items, state that the application is a major red flag. For signing routes that use hardcoded or API-derived data (not user input), include: 'Route X relies on [API/service Y]. If this API is compromised, signatures could be compromised.'",
  "mnemonicUsage": [
    {
      "function": "function name or route",
      "purpose": "what it does with mnemonic",
      "risks": ["risk1", "risk2"],
      "canWithdrawFunds": true/false,
      "canSignArbitrary": true/false,
      "signingReliesOn": "if signing but canSignArbitrary=false: describe data source (e.g. 'hardcoded gm+timestamp', 'data from /api/config'). Omit if no signing or canSignArbitrary=true"
    }
  ],
  "envVariables": [
    {
      "name": "VAR_NAME",
      "sensitivity": "CRITICAL|HIGH|MEDIUM|LOW",
      "usage": "brief description of how it's used"
    }
  ],
  "adminExploitPaths": [
    {
      "path": "route or flow",
      "description": "how admin could exploit",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW"
    }
  ],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

export interface ProjectOverview {
  description: string;
  techStack: string[];
  entryPoint: string;
  keyRoutes: string[];
}

export interface MnemonicExposureRisk {
  pattern: string;
  severity: string;
  description: string;
  location: string;
}

export interface AgentPaymentSafety {
  safetyScore: number;
  verdict: "ALLOW" | "LIMIT" | "REVIEW" | "BLOCK" | string;
  shouldProceedWithAgentCash: boolean;
  reasoning: string;
  recommendedLimits: string[];
}

export interface EndpointBehaviorClaim {
  endpoint: string;
  claimedBehavior: string;
  implementationEvidence: string;
  honestyRisk: string;
  notes: string;
}

export interface ThirdPartyDependency {
  name: string;
  purpose: string;
  risk: string;
  failureImpact: string;
}

export interface AnalysisResult {
  projectOverview: ProjectOverview;
  agentPaymentSafety: AgentPaymentSafety;
  endpointBehaviorClaims: EndpointBehaviorClaim[];
  thirdPartyDependencies: ThirdPartyDependency[];
  mnemonicExposureRisks: MnemonicExposureRisk[];
  summary: string;
  mnemonicUsage: {
    function: string;
    purpose: string;
    risks: string[];
    canWithdrawFunds: boolean;
    canSignArbitrary: boolean;
    signingReliesOn?: string;
  }[];
  envVariables: {
    name: string;
    sensitivity: string;
    usage: string;
  }[];
  adminExploitPaths: {
    path: string;
    description: string;
    severity: string;
  }[];
  recommendations: string[];
}

export async function analyzeImage(
  imageRef: string,
  tag: string = "latest",
): Promise<
  | {
      analysis: AnalysisResult;
      image: string;
      rawResponse?: string;
      exploreDigest?: string;
    }
  | { error: string }
> {
  const exploreResult = await getExploreResult(imageRef, tag);
  if ("error" in exploreResult) {
    return { error: exploreResult.error };
  }

  const code = exploreResult.concatenatedJsContent;
  if (
    !code ||
    code === "(no readable .js files)" ||
    code === "(no readable code files)"
  ) {
    return { error: "No readable code found in layer" };
  }

  try {
    const modelOptions = { eigenModel: "anthropic/claude-sonnet-4.6" };
    const model = getInferenceModelName(modelOptions);
    const prompt = `${SYSTEM_PROMPT}

Analyze this application code from Docker image ${exploreResult.image}:

${code}`;
    console.error(`[analysis] Calling ${model} (${code.length} chars context)...`);
    const { text } = await generateText({
      model: getInferenceModel(modelOptions),
      prompt,
    });

    const content = text?.trim();
    if (!content) {
      return { error: "No response from AI model" };
    }

    let analysis: AnalysisResult;
    try {
      const parsed = JSON.parse(content);
      const projectOverview = parsed.projectOverview;
      const agentPaymentSafety = parsed.agentPaymentSafety;
      analysis = {
        projectOverview: projectOverview
          ? {
              description: projectOverview.description ?? "",
              techStack: Array.isArray(projectOverview.techStack)
                ? projectOverview.techStack
                : [],
              entryPoint: projectOverview.entryPoint ?? "",
              keyRoutes: Array.isArray(projectOverview.keyRoutes)
                ? projectOverview.keyRoutes
                : [],
            }
          : {
              description: "",
              techStack: [],
              entryPoint: "",
              keyRoutes: [],
            },
        agentPaymentSafety: agentPaymentSafety
          ? {
              safetyScore:
                typeof agentPaymentSafety.safetyScore === "number"
                  ? agentPaymentSafety.safetyScore
                  : 0,
              verdict: agentPaymentSafety.verdict ?? "REVIEW",
              shouldProceedWithAgentCash:
                typeof agentPaymentSafety.shouldProceedWithAgentCash ===
                "boolean"
                  ? agentPaymentSafety.shouldProceedWithAgentCash
                  : false,
              reasoning: agentPaymentSafety.reasoning ?? "",
              recommendedLimits: Array.isArray(
                agentPaymentSafety.recommendedLimits,
              )
                ? agentPaymentSafety.recommendedLimits
                : [],
            }
          : {
              safetyScore: 0,
              verdict: "REVIEW",
              shouldProceedWithAgentCash: false,
              reasoning: "",
              recommendedLimits: [],
            },
        endpointBehaviorClaims: Array.isArray(parsed.endpointBehaviorClaims)
          ? parsed.endpointBehaviorClaims.map(
              (claim: {
                endpoint?: string;
                claimedBehavior?: string;
                implementationEvidence?: string;
                honestyRisk?: string;
                notes?: string;
              }) => ({
                endpoint: claim.endpoint ?? "",
                claimedBehavior: claim.claimedBehavior ?? "",
                implementationEvidence: claim.implementationEvidence ?? "",
                honestyRisk: claim.honestyRisk ?? "UNKNOWN",
                notes: claim.notes ?? "",
              }),
            )
          : [],
        thirdPartyDependencies: Array.isArray(parsed.thirdPartyDependencies)
          ? parsed.thirdPartyDependencies.map(
              (dependency: {
                name?: string;
                purpose?: string;
                risk?: string;
                failureImpact?: string;
              }) => ({
                name: dependency.name ?? "",
                purpose: dependency.purpose ?? "",
                risk: dependency.risk ?? "UNKNOWN",
                failureImpact: dependency.failureImpact ?? "",
              }),
            )
          : [],
        mnemonicExposureRisks: Array.isArray(parsed.mnemonicExposureRisks)
          ? parsed.mnemonicExposureRisks.map(
              (r: {
                pattern?: string;
                severity?: string;
                description?: string;
                location?: string;
              }) => ({
                pattern: r.pattern ?? "",
                severity: r.severity ?? "UNKNOWN",
                description: r.description ?? "",
                location: r.location ?? "",
              }),
            )
          : [],
        summary: parsed.summary ?? "Analysis complete",
        mnemonicUsage: Array.isArray(parsed.mnemonicUsage)
          ? parsed.mnemonicUsage
          : [],
        envVariables: Array.isArray(parsed.envVariables)
          ? parsed.envVariables
          : [],
        adminExploitPaths: Array.isArray(parsed.adminExploitPaths)
          ? parsed.adminExploitPaths
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : [],
      };
    } catch {
      return { error: "AI returned invalid JSON" };
    }
    return {
      analysis,
      image: exploreResult.image,
      rawResponse: content,
      exploreDigest: exploreResult.digest,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Analysis failed: ${message}` };
  }
}
