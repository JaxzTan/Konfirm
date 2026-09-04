# PRD: Konfirm

| Field | Value |
|---|---|
| Author | Jaxz Tan Cheng Soo |
| Status | Draft |
| Version | 1.0 |
| Last updated | 2026-08-29 |
| Related TRD | TRD-konfirm.md |
| Event | MUBA Hack 2026 · submit 09-05 · pitch 09-06 @ APU |
| Target tracks | Gonka Router — AI For Society ($2,000) · Sui Foundation — AI × SUI ($1,500) |

---

## 1. Problem statement

在马来西亚,谣言和诈骗信息主要通过 WhatsApp 家族群和 Facebook 转发扩散,内容混着英文、马来文、中文和方言拼音,没有出处也没有日期。收到的人分两类:长辈相信并继续转发;年轻一辈知道是假的,却拿不出能说服长辈的东西,于是沉默。

现有渠道对这个场景全部失效。Sebenarnya.my 更新慢且只有马来文/英文;国际 fact-check 工具不认本地语境;而任何单一 AI 给出的「这是假的」本身也只是另一个无法被验证的断言 —— 长辈凭什么信一个聊天机器人,而不信认识三十年的老同学。

**问题因此有两层:** 判断层(跨语言、本地语境的真伪判断)和信任层(判断结果本身必须能被第三方独立核实,而不是「再信我一次」)。目前没有工具同时解决这两层。

---

## 2. Goals & success metrics

| Goal | Metric | Target |
|---|---|---|
| G1 · 零门槛 | 从未用过钱包的人,从打开页面到看到完整判决所需时间与操作 | < 60 秒,0 次钱包安装,0 次 gas 支付 |
| G2 · 可独立验证 | 已存证的判决中,能在 Sui explorer 查到对应 object 且 Gonka Request ID 可逐条对应的比例 | 100% |
| G3 · 真正多语言 | EN / BM / 中文 各 10 条测试样本,判决返回语言与输入语言一致 | ≥ 9/10 每种语言 |
| G4 · 现场可演示 | 评委临时提供一条未见过的信息,完成核查并存证的耗时 | < 90 秒 |

---

## 3. Out of scope for demo

9 天、3 人、只有 1 人碰链。以下**明确不做**,任何人提出都拒绝:

- ❌ WhatsApp bot、浏览器插件、移动 App —— 只做 web,链接分享出去即可
- ❌ 用户账号系统、历史记录、收藏夹 —— zkLogin 只用于签名,不建用户表
- ❌ 主网部署或任何真实资金 —— 赛制明令 = 立即取消资格
- ❌ 社群投票、多数决、加权纠错、声誉系统、代币激励(FR-13 的 challenge **不是**这些,见下)
- ❌ 自建爬虫抓新闻源 —— 依赖模型自身知识 + 用户提供的 URL 正文
- ❌ 深色模式、多主题、动画打磨、SEO
- ❌ 方言语音输入(广东话/福建话)—— 写进 pitch roadmap,不写进代码
- ❌ Sui Payments & Stablecoins track —— 与本项目无共用代码,分兵两边都做不完

---

## 4. Target users & personas

**P1 · Wei Jie,24 岁,KL 上班族(主要用户)**
早上在家族群收到妈妈转发的「某某食物治糖尿病」。触发时刻:他想回复,但打不出让对方信服的那段话。

**P2 · Auntie Lim,58 岁,中文 + 马来文阅读者(被说服的一方)**
不装钱包,不懂 crypto,手机里只有 WhatsApp 和 Facebook。她不会主动来用 Konfirm —— 她是**被 P1 转发的那张卡片说服的人**。体验标准:点开就看得懂,字够大,语言对,不需要注册。

**P3 · 社群管理员 / 校园媒体 / NGO(信任层与 challenge 的存在理由)**
需要在自己的频道引用核查结果,也需要在结果错误时留下公开异议。触发时刻:有人质疑「你这个结论是不是后来改过」,或者他自己发现某条判决是错的。P3 是 power user,**有钱包**。

---

## 5. User stories & functional requirements

### Epic A · 判断层(所有 AI 推理必须经 gonkarouter.io)

| ID | User story | Prio | Acceptance criteria |
|---|---|---|---|
| FR-1 | 作为 P1,我要能直接粘贴整段转发文字或一条 URL,不用先整理格式 | Must | · 输入框接受 ≥ 2000 字纯文本<br>· 输入 URL 时自动抓取正文再核查 |
| FR-2 | 作为 P2,我要判决用我输入的语言回给我 | Must | · 自动侦测 EN / BM / 中文<br>· 判决全文、理由、卡片文案统一使用该语言 |
| FR-3 | 作为 P3,我要知道结论是多个模型交叉验证出来的,不是一家之言 | Must | · 每次核查并行调用 ≥ 3 个模型<br>· 全部经由 GonkaRouter |
| FR-4 | 作为 P1,我要一个一眼能看懂的 Truth Score,而且模型意见不一致时它要诚实说出来 | Must | · 输出 0–100 分 + 模型分歧区间<br>· 模型跨界分歧时**不显示分数**,改显示两方立场<br>· 多数模型判定「无法查证」时不显示分数 |
| FR-5 | 作为 P3,我要看到每个模型各自的推理,以及它们在哪里产生分歧 | Must | · 逐模型展开 reasoning<br>· 标出各模型危险信号标注的差集 |
| FR-6 | 作为评审,我要看到 Gonka Request ID,以证明推理确实跑在 Gonka 上 | Must | · 每次调用的 Request ID 显示在 UI 并写入链上记录 |
| FR-7 | 作为 P1,我要看到这条信息为什么像假的,而不只是一个分数 | Should | · 输出 3–5 条可读的危险信号标签(无出处 / 无日期 / 情绪化措辞 / 要求转发等) |

### Epic B · 信任层(Sui 是核心,不是外挂)

| ID | User story | Prio | Acceptance criteria |
|---|---|---|---|
| FR-8 | 作为 P3,我要每条判决都是一个链上对象且事后无法修改 | Must | · Sui testnet 上创建 shared `Verdict` object:claim hash、语言、分数、状态、模型列表、Gonka Request IDs、时间戳、Walrus blob ID<br>· 合约无 update / delete entry;唯一可变字段是 `challenge_count`,且只能 +1 |
| FR-9 | 作为 P3,我要拿到完整推理原文而不只是摘要 | Must | · 完整 reasoning trace 存 Walrus<br>· blob ID 写入 Verdict object |
| FR-10 | 作为任何人,我要能用一条链接独立复查某条判决,不需要信任 Konfirm 这个网站 | Must | · Verdict 的 **object ID 即 permalink**,无需另建短链服务<br>· 公开验证页无登录墙,展示链上字段 + Walrus 原文 + Sui explorer 直链 |
| FR-11 | 作为 P2,我要用 Google 登录就能用,不要叫我装钱包 | Must | · zkLogin 登录<br>· 全流程不出现助记词、钱包安装、私钥字样 |
| FR-12 | 作为 P2,我不要付任何手续费 | Must | · Sponsored transaction,用户端 gas = 0 |
| FR-13 | 作为 P3,我要能对一条我认为错误的判决留下公开异议,而且这条异议同样删不掉 | Should | · 任何持钱包地址可提交 `Challenge`(指向 verdict + Walrus 证据 blob)<br>· Verdict 上的 `challenge_count` 与异议列表显示在验证页<br>· **无投票、无加权、无多数决、无声誉分** —— 纯 append-only 异议记录<br>· challenge 走普通钱包签名,不接 zkLogin、不接 sponsored tx |

### Epic C · 分发层(产品能不能真的解决问题的关键)

| ID | User story | Prio | Acceptance criteria |
|---|---|---|---|
| FR-14 | 作为 P1,我要一张可以直接转发回家族群的反驳卡片,语气礼貌、不让长辈下不了台 | Must | · 生成图片或格式化文本<br>· 语言 = 原信息语言<br>· 语气模板:不指责转发者,只陈述证据 |
| FR-15 | 作为 P2,我点卡片上的链接要能看到完整判决,不需要注册 | Must | · 卡片附 verdict object 链接 → FR-10 验证页<br>· 该页面无登录墙 |
| FR-16 | 作为 P1,我要能一键复制/分享到 WhatsApp | Should | · Web Share API + 复制按钮双通道 |

**Could(有余力才做):** 常见谣言样本库一键试用(降低评委上手成本)· 验证页 OG image 预览
**Won't:** 见第 3 节

---

## 6. User flow

**最重要的一屏是判决结果页。** 它同时服务三个人 —— P1 判断要不要转发、P2 被说服、P3 验证真伪。这一屏做砸,整个产品的说服力归零。

1. P1 打开 Konfirm(无需登录即可开始输入)
2. 粘贴整段 WhatsApp 转发文字 → 点「Konfirm」
3. 系统侦测语言 → 并行请求 3 个模型(GonkaRouter)→ 聚合
4. **判决页**:Truth Score(或「模型分歧」/「无法查证」)+ 分歧区间 + 危险信号 + 逐模型 reasoning + Gonka Request IDs
5. P1 点「存证 & 分享」→ zkLogin(Google)→ sponsored tx 创建 Verdict object,trace 上 Walrus
6. 生成反驳卡片(原语言)→ 一键分享回家族群
7. P2 在群里点开链接 → 公开验证页,无需登录 → 看懂结论
8. P3 从同一页面点进 Sui explorer 独立核对;若判决有误,连钱包提交 Challenge

> ⚠️ Assumption:步骤 5 放在判决之后而非之前,是为了让未登录用户也能完成核心体验(G1 的 60 秒目标)。上链只在用户要分享时触发。

---

## 7. Non-functional requirements

| ID | Category | Requirement | Rationale |
|---|---|---|---|
| NFR-1 | Performance | 三模型并行调用,判决 p95 < 20 秒 | 串行会拖到 40 秒以上,现场 demo 死在这里(G4) |
| NFR-2 | Security | Gonka API key 与 sponsor 私钥**只存服务端**,永不进客户端 bundle、永不进 public repo | public repo 泄 key,bot 几分钟内刷爆额度 |
| NFR-3 | Cost | 全程只有 $20 Gonka credit:限制输入长度、按 claim hash 缓存、demo 前查余额 | 额度烧完 = 现场 demo 直接挂 |
| NFR-4 | Privacy (PDPA) | 链上**只写 claim 的 hash,绝不写原文**;上传 Walrus 前对 reasoning 做 PII 脱敏 | 大马 PDPA 2010;转发内容常含姓名、电话、IC 号;上链不可删除,写错无法补救 |
| NFR-5 | Accessibility | 判决页最小字号 16px;结论用大字 + 颜色 + 文字三重表达;禁用技术黑话 | P2 是 58 岁用户;色盲也要能读 |
| NFR-6 | Localization | UI 与模型输出统一 EN / BM / 中文,日期用本地格式 | 多语言是本项目相对其他 fact checker 的核心差异 |
| NFR-7 | Reliability | 任一模型超时/失败,仍以剩余模型出结果并**明确标注仅 N 个模型参与**;仅 1 个模型时不给分数 | 静默降级会破坏 FR-3 的诚实性;demo 当天网络不可控 |
| NFR-8 | Regulatory | Konfirm **不涉及任何价值转移、代币发行或资金托管**,无 BNM / SC 牌照面 | 主动在 pitch 与 README 声明,避免被误判为金融应用;同时呼应赛制禁止主网真实资金 |
| NFR-9 | Compliance (赛制) | Repo public;commit 起始 ≥ 2026-08-26;README 含 testnet package 地址;提交时声明所有使用过的 AI 工具 | 任一项缺失 = 直接 DQ,与技术无关 |

---

## 8. Assumptions & open questions

**Assumptions(若为假则计划要改)**

- 队伍 3 人:Jaxz(backend + Move + 全部链上)+ 1 前端/设计 + 1 pitch/内容。队友 Web3 经验浅,**链上工作 100% 由 Jaxz 承担**,队友不碰 Sui SDK。赛制要求 2–4 人,达标。
- Sui testnet 可被接受 —— 赛制明确要求提交 testnet 合约地址。
- Gonka 的 "PREFERRED FACT CHECKER" 是加分项而非硬门槛,但我们照着做满(FR-1/3/4/5/6 逐条对应),不赌它是建议。
- 同一 project 可在 Devfolio 同时投 Gonka 与 Sui 两个 track。
- 上链只能证明「记录没被改过」,**不能证明内容是对的**。这一点必须在 pitch 与 README 主动承认 —— FR-13 的 challenge 正是对它的回应。

**Open questions**

| 问题 | Owner | Decide by |
|---|---|---|
| Walrus testnet 的可用性与配额?失败时 fallback 走 Vercel Blob + 链上存 trace hash 是否可接受? | Jaxz | 08-31 Sui workshop |
| zkLogin salt service 用 Mysten 托管还是自建?9 天内哪个风险低? | Jaxz | 08-31 |
| Gonka 端 multi-model cross-verification 的最低模型数? | Jaxz | 08-30 |
| Devfolio 上是一次提交打两个 track,还是交两份? | 队内 admin | 09-03 |

---

## 9. Milestones

| Milestone | Scope | Target |
|---|---|---|
| M1 · 判断层可单独 demo(不登录、不上链) | FR-1 → FR-7 | 08-31 |
| M2 · 信任层端到端(zkLogin + 上链 + 验证页 + 卡片) | FR-8 → FR-12,FR-14 → FR-16 | 09-02 |
| M3 · 功能冻结 + 线上 URL 稳定;FR-13 challenge 视余力并入 | 全部 Must | **09-03** |
| M4 · 提交包(README / 视频 / AI 工具声明) | NFR-9 | 09-04 |
| M5 · 白天提交 + Pitch 完整演练 ×5 | — | 09-05 |
