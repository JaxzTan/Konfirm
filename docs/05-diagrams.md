# 5. Diagrams — for slides and whiteboards

All rendered with Mermaid (GitHub, VS Code with a Mermaid extension, and mermaid.live all
display these). Copy any block into a slide tool, or screenshot from mermaid.live.

## 5.1 The one-slide overview

```mermaid
flowchart TD
    A["📱 Forwarded WhatsApp message"] --> B["Konfirm — text / link / screenshot"]
    B --> C["Several AI models, in parallel<br/>GonkaRouter + Gemini"]
    C --> D["Aggregated verdict<br/>+ honest 'they disagree' case"]
    D --> E{"User chooses to attest?"}
    E -->|no| F["Just read the answer — done"]
    E -->|yes| G["Sign in with Google (zkLogin)"]
    G --> H["Reasoning trace → Walrus<br/>(PII-redacted)"]
    H --> I["Verdict summary + blob ID → Sui<br/>(gas sponsored, user pays 0)"]
    I --> J["Shareable permalink /v/objectId"]
    J --> K["Anyone can verify — no login, no wallet"]
    K --> L["Disagree? Attach a permanent Challenge"]
```

## 5.2 zkLogin — Google account to Sui address

```mermaid
flowchart LR
    G["Google account"] --> JWT["JWT<br/>(stays in the browser)"]
    EPH["Ephemeral keypair<br/>(browser, temporary)"] --> NONCE["nonce"]
    NONCE --> JWT
    SALT["Per-app salt<br/>(Enoki salt service)"] --> SEED
    JWT --> SEED["address_seed =<br/>hash(sub, aud, salt)"]
    SEED --> ADDR["Sui address 0x…"]
    JWT --> PROOF["Zero-knowledge proof<br/>(Enoki prover)"]
    EPH --> SIG["Ephemeral signature"]
    PROOF --> TX["zkLogin signature"]
    SIG --> TX
    TX --> V["Sui validators verify natively<br/>— the Google identity is never revealed"]
    ADDR --> STABLE["Same Google account + same Enoki app<br/>⇒ always the same address (FR-11)"]
```

## 5.3 The full attest flow, end to end

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant AT as /api/attest
    participant W as Walrus publisher
    participant SP as /api/sponsor
    participant EN as Enoki (private key)
    participant S as Sui testnet

    U->>B: "Save this as proof"
    B->>B: Confirm-before-sign screen<br/>(Enoki shows no wallet popup)
    U->>B: Confirm
    B->>B: computeClaimHash() — SHA-256, in-browser
    B->>AT: { lang, verdict result }
    AT->>AT: redactDeep() — phone / IC / email
    AT->>W: PUT /v1/blobs
    W-->>AT: blobId
    AT-->>B: blobId + create_verdict arguments
    B->>B: Build transaction KIND (no gas)
    B->>SP: POST /api/sponsor
    SP->>EN: createSponsoredTransaction
    EN-->>SP: { bytes, digest }
    SP-->>B: { bytes, digest }
    B->>B: zkLogin wallet signs; assert bytes unchanged
    B->>SP: POST /api/sponsor/execute
    SP->>EN: executeSponsoredTransaction
    EN->>S: Submit — sponsor pays gas
    S-->>B: Verdict object created
    B->>U: /v/{objectId} — share it
```

## 5.4 Where every piece of data lives

```mermaid
flowchart TB
    subgraph OFF["Never persisted"]
        RAW["Raw claim text"]
    end
    subgraph WALRUS["Walrus — large, public, content-addressed"]
        TR["Full reasoning trace (PII-redacted)<br/>descriptions · key signals · per-model reasoning"]
    end
    subgraph SUI["Sui — small, permanent, append-only"]
        VO["Verdict object<br/>claim_hash · lang · state · score · spread<br/>confidence · models · request_ids<br/>trace_blob · challenge_count · created_at · attester"]
        CH["Challenge object<br/>verdict_id · evidence_blob · challenger"]
    end

    RAW -->|sha256| VO
    RAW --> TR
    TR -->|"blobId only"| VO
    CH -->|"increments challenge_count (+1 only)"| VO
```

## 5.5 Who pays for what

```mermaid
flowchart LR
    subgraph USER["User — pays nothing, holds no tokens"]
        A1[Check] --> A2[Google sign-in] --> A3[Attest] --> A4[Share]
    end
    subgraph KONFIRM["Konfirm — operator costs"]
        B1["WAL — Walrus storage<br/>(via the publisher, server-side)"]
        B2["SUI — gas for create_verdict<br/>(Enoki sponsor pool)"]
        B3["AI inference credits"]
    end
    subgraph P3["Challenger — self-paid, by design"]
        C1["SUI — gas for registry::challenge<br/>NOT in the sponsor allowlist"]
    end
    A3 --> B1
    A3 --> B2
    A1 --> B3
```

## 5.6 Sharing and independent verification

```mermaid
flowchart TD
    OBJ["Verdict object ID<br/>= the permalink"]
    OBJ --> V["/v/{objectId}<br/>public verification page"]
    OBJ --> C["/card/{objectId}<br/>shareable rebuttal card"]
    C --> SH["navigator.share() → WhatsApp<br/>(fallback: copy link)"]
    SH --> R["Recipient — no wallet, no login, no app"]
    R --> V
    V --> S1["Sui fullnode: the verdict fields"]
    V --> S2["Walrus aggregator: the reasoning"]
    R -.->|"doesn't trust Konfirm?"| SC["Suiscan directly"]
    R -.->|"doesn't trust Konfirm?"| AG["Any Walrus aggregator directly"]
    R -.->|"disagrees?"| CHG["registry::challenge<br/>own wallet, own gas, permanent"]
```
