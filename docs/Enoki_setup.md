# Konfirm · Enoki (zkLogin + 赞助交易) 接入手册

**适用范围**：Next.js App Router + Sui testnet
**预计耗时**：配置 1 小时 + 代码 2 小时
**参考**：`docs.enoki.mystenlabs.com`

---

## 开始之前

本手册使用当前推荐的 **`registerEnokiWallets` + wallet-standard** 路线。

> **警告**：网上大量教程仍在使用旧的 `EnokiFlowProvider` / `useEnokiFlow` API。那套已被 wallet-standard 集成取代，**不要抄**。新方案代码量少得多。
>
> 官方明确标注 Enoki TypeScript SDK 仍在活跃开发中、实现会频繁变动。遇到与本手册不符时，以 `docs.enoki.mystenlabs.com` 为准。

**为什么用 Enoki 而不是手搓 zkLogin**：Enoki 把 salt 服务、prover、以及 gas 赞助打包进一个 API key。手搓这三样是 2–3 天，用 Enoki 是半天。

---

## Step 1 — Google Cloud Console

### 1.1 建 Project

进 Google Cloud Console，新建或选择一个 project。

### 1.2 配 OAuth consent screen

- User Type 选 **External**
- 发布状态保持 **Testing**（hackathon 不需要走发布审核）
- **把你、队友、以及所有需要试用的 Google 账号加进 Test users**

### 1.3 创建 OAuth Client ID

Credentials → **Create Credentials → OAuth client ID** → Application type 选 **Web application**。

两处都要填：

| 字段 | 值 |
|---|---|
| Authorized JavaScript origins | `http://localhost:3000`、`https://你的-vercel-域名` |
| Authorized redirect URIs | `http://localhost:3000`、`https://你的-vercel-域名` |

Create → 复制 **Client ID**（形如 `xxxxx.apps.googleusercontent.com`）。

> **Client Secret 用不到。** zkLogin 只需要 Client ID。

### 1.4 调试技巧：redirect_uri_mismatch

如果登录弹窗报 `redirect_uri_mismatch`，Google 的错误页会**原样显示它实际收到的 redirect_uri**。

直接复制那一串粘回 Console，**不要猜**。这个错误会吃掉半小时，除非你知道这招。

---

## Step 2 — Enoki Portal

进 `portal.enoki.mystenlabs.com`，用 Google 登录。首次会询问一些基本信息和付费计划 —— **选 Free，足够 hackathon 使用**。

### 2.1 Create App

填名字，例如 `konfirm`。

> **建好之后不要删除重建。** 见 Step 6 第 4 条。

### 2.2 创建两把 API Key

需要两把 —— 一把给客户端的 zkLogin，一把给后端的赞助交易：

| Key 类型 | 环境变量 | 用途 |
|---|---|---|
| Public | `NEXT_PUBLIC_ENOKI_API_KEY` | 浏览器端，可暴露 |
| Private / Secret | `ENOKI_SECRET_KEY` | **仅服务端**，绝不加 `NEXT_PUBLIC_` 前缀 |

API Key 按**网络**绑定，创建时选 **testnet**。

### 2.3 注册 Auth Provider

Auth Providers → Add provider → 选 **Google** → 粘贴 Step 1.3 的 Client ID。

### 2.4 赞助交易 allowlist（最容易漏的一步）

在 private key 的配置里，**显式列出允许被赞助的 Move call target**：

```
0x你的PACKAGE_ID::verdict::submit_verdict
0x你的PACKAGE_ID::verdict::add_challenge
```

> **严重警告**
>
> 合约每次执行 `sui client publish` 都会产生**新的 PACKAGE_ID**。allowlist 里的旧 ID 会立刻失效，**赞助会静默失败**。
>
> 把「更新 Enoki allowlist」写进部署 checklist，与更新 `.env` 并列。这是彩排阶段最可能出现的 bug。

---

## Step 3 — 装包与 Provider

```bash
pnpm add @mysten/enoki @mysten/dapp-kit @mysten/sui @tanstack/react-query
```

```tsx
// app/providers.tsx
'use client';

import {
  createNetworkConfig,
  SuiClientProvider,
  useSuiClientContext,
  WalletProvider,
} from '@mysten/dapp-kit';
import { isEnokiNetwork, registerEnokiWallets } from '@mysten/enoki';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
});

const queryClient = new QueryClient();

function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!isEnokiNetwork(network)) return;

    const { unregister } = registerEnokiWallets({
      apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
      providers: {
        google: { clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID! },
      },
      client,
      network,
    });

    return unregister;
  }, [client, network]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

**两个硬性要求：**

1. `RegisterEnokiWallets` **必须渲染在 `WalletProvider` 之前**
2. Enoki 钱包绑定特定网络，切换网络时必须用新的 client 和 network 重新注册（上面的 `useEffect` 依赖数组已处理）

---

## Step 4 — 登录

### 4.1 最省事的做法

```tsx
import { ConnectButton } from '@mysten/dapp-kit';

export const Login = () => <ConnectButton />;
```

Google 会作为一个「钱包」出现在弹窗列表里。

### 4.2 Konfirm 应该用自定义按钮

Konfirm 的目标用户是普通马来西亚人，看到「Connect Wallet」会直接跑掉。

```tsx
'use client';

import { useConnectWallet, useCurrentAccount, useWallets } from '@mysten/dapp-kit';
import { isEnokiWallet, type EnokiWallet, type AuthProvider } from '@mysten/enoki';

export function GoogleLogin() {
  const account = useCurrentAccount();
  const { mutate: connect } = useConnectWallet();

  const google = useWallets()
    .filter(isEnokiWallet)
    .reduce((m, w) => m.set(w.provider, w), new Map<AuthProvider, EnokiWallet>())
    .get('google');

  if (account) return <span>{account.address.slice(0, 6)}…</span>;
  if (!google) return null;

  return (
    <button onClick={() => connect({ wallet: google })}>
      用 Google 登录
    </button>
  );
}
```

选中 provider 后，Enoki SDK 会自动在弹窗中处理完整个 OAuth 流程，并把该钱包设为当前活跃账户。

---

## Step 5 — 签名并执行（赞助自动生效）

```tsx
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';

const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

const tx = new Transaction();
tx.moveCall({
  target: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::verdict::submit_verdict`,
  arguments: [/* ... */],
});

const { digest } = await signAndExecute({ transaction: tx });
```

只要 target 在 Step 2.4 的 allowlist 里，**gas 由 Enoki 代付，用户余额始终为 0**。

这就是流程图里「gas sponsored, user pays 0」那一格的全部实现量 —— 除 Step 2.4 之外不需要写任何赞助逻辑。

> 官方文档里那套后端 `transaction-blocks/sponsor` 两步流程，是给「不使用 Enoki 钱包但仍要赞助」的场景准备的。**本项目不需要，别看那一页。**

---

## Step 6 — 接回 KonfirmIdentity 接口

```ts
// lib/signer.ts
'use client';

import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';

export function useKonfirmIdentity() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  return {
    identity: account ? { address: account.address } : null,
    logout: () => disconnect(),
  };
}
```

`login` 现在由 `<GoogleLogin />` 组件承担，接口比原设计还简单。交付这个文件即可替换掉 mock 实现。

---

## 六个会绊倒你们的点

**1. Enoki 签名不弹确认框**

与普通钱包不同，签名**不需要用户确认批准** —— 点一下就上链了。

必须自己做一个「确认存证」的 UI，否则用户会误触，而且评委会问「用户知道自己在上链吗」。

**2. allowlist 用 PACKAGE_ID 精确匹配**

重新部署合约 = 必须回 Portal 更新 allowlist。写进 checklist。

**3. Consent screen 的 Test users 名单**

External + Testing 模式下，**只有名单里的 Google 账号能登录**。

Demo 前把队友、以及现场需要试用的账号全部加进去。或者把 consent screen 切到 Production —— 但那可能触发审核，**不要在 D-1 做这个动作**。

**4. salt 是 per-app 的**

同一个用户在不同 Enoki app 下会得到**不同的 Sui 地址**。

意味着：如果中途在 Portal 删除重建 App，所有已有用户的地址会全部改变。**不要重建 App。**

**5. Next.js 必须标 `'use client'`**

所有 dapp-kit hook 和 `registerEnokiWallets` 都是浏览器端的，放进 server component 会直接报错。

**6. 别忘了引入 dapp-kit 样式**

```ts
import '@mysten/dapp-kit/dist/index.css';
```

漏了的话 `ConnectButton` 弹窗会完全没有样式，看起来像坏了。

---

## 环境变量清单

```
NEXT_PUBLIC_ENOKI_API_KEY=
ENOKI_SECRET_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_PACKAGE_ID=
NEXT_PUBLIC_SUI_NETWORK=testnet
```

## 验收标准

按顺序确认，任一步不过就停下来修，不要往下走：

1. `<GoogleLogin />` 能弹出 Google 弹窗
2. 登录后 `useCurrentAccount()` 返回一个 `0x...` 地址
3. 该地址在 Sui testnet 浏览器上余额为 **0 SUI**
4. 调用 `submit_verdict` 成功返回 digest
5. 交易详情里 gas payer **不是**用户地址
6. 同一个 Google 账号重新登录，得到**同一个**地址

第 3 和第 5 条同时成立，才说明赞助真的生效了。
