# Agency Agents 인덱스

> 출처: https://github.com/msitarzewski/agency-agents
> Tier 2에서 이 파일을 읽고 역할을 매칭한다. 매칭 후 해당 경로의 raw 파일을 fetch.
>
> **Fetch URL 패턴:**
> `https://raw.githubusercontent.com/msitarzewski/agency-agents/main/{path}`
>
> **온디맨드 캐시:** fetch 후 `.kkirikkiri/agent-cache/{filename}.md`에 저장.
> 다음 실행 시 캐시 먼저 확인 → 있으면 즉시 사용.

---

## 매칭 방법

1. 역할 키워드와 **When to Use** 컬럼을 대조
2. 80% 이상 확신 시 해당 `path`로 fetch
3. 미만이면 Tier 3으로 전환 (fetch 금지)

---

## Engineering

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Frontend Developer | engineering/engineering-frontend-developer.md | React/Vue/Angular, UI | Modern web apps, pixel-perfect UIs, Core Web Vitals |
| Backend Architect | engineering/engineering-backend-architect.md | API design, database, scalability | Server-side systems, microservices, cloud infrastructure |
| Mobile App Builder | engineering/engineering-mobile-app-builder.md | iOS/Android, React Native, Flutter | Native and cross-platform mobile apps |
| AI Engineer | engineering/engineering-ai-engineer.md | ML models, deployment, AI integration | ML features, data pipelines, AI-powered apps |
| DevOps Automator | engineering/engineering-devops-automator.md | CI/CD, infrastructure automation | Pipeline development, deployment automation, monitoring |
| Rapid Prototyper | engineering/engineering-rapid-prototyper.md | Fast POC, MVPs | Quick proof-of-concepts, hackathon, fast iteration |
| Senior Developer | engineering/engineering-senior-developer.md | Laravel/Livewire, advanced patterns | Complex implementations, architecture decisions |
| Security Engineer | engineering/engineering-security-engineer.md | Threat modeling, secure code review | Application security, vulnerability assessment |
| Code Reviewer | engineering/engineering-code-reviewer.md | Code review, security, maintainability | PR reviews, code quality gates, mentoring |
| Software Architect | engineering/engineering-software-architect.md | System design, DDD, architectural patterns | Architecture decisions, domain modeling |
| Technical Writer | engineering/engineering-technical-writer.md | Developer docs, API reference | Clear technical documentation |
| SRE | engineering/engineering-sre.md | SLOs, observability, chaos engineering | Production reliability, toil reduction |
| Data Engineer | engineering/engineering-data-engineer.md | Data pipelines, lakehouse, ETL/ELT | Data infrastructure, warehousing |
| Database Optimizer | engineering/engineering-database-optimizer.md | Schema design, query optimization | PostgreSQL/MySQL tuning, slow query debugging |
| Git Workflow Master | engineering/engineering-git-workflow-master.md | Branching, conventional commits | Git workflow design, history cleanup |
| Security Engineer | engineering/engineering-security-engineer.md | Threat modeling, secure code | Application security, vulnerability |
| Incident Response Commander | engineering/engineering-incident-response-commander.md | Incident management, post-mortems | Production incidents, incident readiness |
| Solidity Smart Contract Engineer | engineering/engineering-solidity-smart-contract-engineer.md | EVM contracts, gas optimization, DeFi | Secure smart contracts, DeFi protocols |
| Codebase Onboarding Engineer | engineering/engineering-codebase-onboarding-engineer.md | Fast developer onboarding, code exploration | Helping new devs understand unfamiliar repos |
| Embedded Firmware Engineer | engineering/engineering-embedded-firmware-engineer.md | Bare-metal, RTOS, ESP32/STM32 | Production embedded systems, IoT |
| AI Data Remediation Engineer | engineering/engineering-ai-data-remediation-engineer.md | Self-healing pipelines, semantic clustering | Fixing broken data at scale |
| Autonomous Optimization Architect | engineering/engineering-autonomous-optimization-architect.md | LLM routing, cost optimization | Autonomous systems, intelligent API selection |
| Voice AI Integration Engineer | engineering/engineering-voice-ai-integration-engineer.md | Speech-to-text, Whisper, ASR | Transcription pipelines, audio preprocessing |
| Email Intelligence Engineer | engineering/engineering-email-intelligence-engineer.md | Email parsing, MIME extraction | Turning email threads into structured data |

## Design

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| UI Designer | design/design-ui-designer.md | Visual design, component libraries | Interface creation, brand consistency |
| UX Researcher | design/design-ux-researcher.md | User testing, behavior analysis | Understanding users, usability testing |
| UX Architect | design/design-ux-architect.md | CSS systems, technical architecture | Developer-friendly foundations |
| Brand Guardian | design/design-brand-guardian.md | Brand identity, consistency | Brand strategy, identity development |
| Whimsy Injector | design/design-whimsy-injector.md | Micro-interactions, delight, Easter eggs | Adding joy, brand personality |
| Image Prompt Engineer | design/design-image-prompt-engineer.md | AI image generation prompts | Midjourney, DALL-E, Stable Diffusion prompts |
| Visual Storyteller | design/design-visual-storyteller.md | Visual narratives, multimedia | Compelling visual stories |
| Inclusive Visuals Specialist | design/design-inclusive-visuals-specialist.md | Representation, bias mitigation | Culturally accurate AI images and video |

## Marketing

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Growth Hacker | marketing/marketing-growth-hacker.md | Rapid acquisition, viral loops | Explosive growth, user acquisition, conversion |
| Content Creator | marketing/marketing-content-creator.md | Multi-platform content, editorial calendars | Content strategy, copywriting, brand storytelling |
| SEO Specialist | marketing/marketing-seo-specialist.md | Technical SEO, content strategy | Organic search growth |
| Social Media Strategist | marketing/marketing-social-media-strategist.md | Cross-platform strategy | Multi-platform social campaigns |
| LinkedIn Content Creator | marketing/marketing-linkedin-content-creator.md | Personal branding, B2B content | LinkedIn growth, professional audience |
| TikTok Strategist | marketing/marketing-tiktok-strategist.md | Viral content, algorithm | TikTok growth, Gen Z audience |
| Reddit Community Builder | marketing/marketing-reddit-community-builder.md | Authentic engagement | Reddit strategy, community trust |
| AI Citation Strategist | marketing/marketing-ai-citation-strategist.md | AEO/GEO, AI recommendation visibility | Improving brand visibility in AI responses |
| Podcast Strategist | marketing/marketing-podcast-strategist.md | Podcast content strategy | Podcast market strategy |
| Video Optimization Specialist | marketing/marketing-video-optimization-specialist.md | YouTube algorithm, chaptering | YouTube channel growth, video SEO |

## Product

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Product Manager | product/product-manager.md | Full lifecycle, PRDs, roadmap | Discovery, roadmap planning, GTM |
| Trend Researcher | product/product-trend-researcher.md | Market intelligence, competitive analysis | Market research, opportunity assessment |
| Sprint Prioritizer | product/product-sprint-prioritizer.md | Agile planning, feature prioritization | Sprint planning, backlog management |

## Sales

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Outbound Strategist | sales/sales-outbound-strategist.md | Signal-based prospecting, multi-channel | Pipeline via research-driven outreach |
| Discovery Coach | sales/sales-discovery-coach.md | SPIN, Gap Selling, call structure | Discovery calls, qualifying opportunities |
| Deal Strategist | sales/sales-deal-strategist.md | MEDDPICC, competitive positioning | Scoring deals, pipeline risk |
| Sales Engineer | sales/sales-engineer.md | Technical demos, POC scoping | Pre-sales technical wins |
| Pipeline Analyst | sales/sales-pipeline-analyst.md | Forecasting, deal velocity | Pipeline reviews, forecast accuracy |
| Account Strategist | sales/sales-account-strategist.md | Land-and-expand, QBRs | Post-sale expansion, account planning |

## Paid Media

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| PPC Campaign Strategist | paid-media/paid-media-ppc-strategist.md | Google/Amazon Ads, bidding | Account buildouts, budget allocation |
| Search Query Analyst | paid-media/paid-media-search-query-analyst.md | Search term analysis, negative keywords | Query audits, wasted spend elimination |
| Paid Media Auditor | paid-media/paid-media-auditor.md | 200+ point audits | Account takeovers, quarterly reviews |
| Ad Creative Strategist | paid-media/paid-media-creative-strategist.md | RSA copy, Meta creative | Creative launches, testing programs |
| Paid Social Strategist | paid-media/paid-media-paid-social-strategist.md | Meta, LinkedIn, TikTok | Social ad programs, audience strategy |

## Testing & QA

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Reality Checker | testing/testing-reality-checker.md | Assumption challenges, devil's advocate | Quality validation, bias checking |
| Accessibility Auditor | testing/testing-accessibility-auditor.md | WCAG, assistive technology | Accessibility compliance |

## Specialized

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Agents Orchestrator | specialized/agents-orchestrator.md | Multi-agent coordination | Complex projects requiring agent coordination |
| Blockchain Security Auditor | specialized/blockchain-security-auditor.md | Smart contract audits | Finding vulnerabilities before deployment |
| MCP Builder | specialized/specialized-mcp-builder.md | MCP servers, AI agent tooling | Building MCP servers for AI agents |
| Workflow Architect | specialized/specialized-workflow-architect.md | Workflow discovery, mapping | Mapping every path through a system |
| Compliance Auditor | specialized/compliance-auditor.md | SOC 2, ISO 27001, HIPAA | Compliance certification |
| Developer Advocate | specialized/specialized-developer-advocate.md | Community building, DX | Bridging product and developer community |
| Recruitment Specialist | specialized/recruitment-specialist.md | Talent acquisition | Recruitment strategy, sourcing |

## Finance

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Financial Analyst | finance/finance-financial-analyst.md | Financial modeling, forecasting | Three-statement models, business intelligence |
| Investment Researcher | finance/finance-investment-researcher.md | Due diligence, portfolio analysis | Investment thesis, risk assessment |
| FP&A Analyst | finance/finance-fpa-analyst.md | Budgeting, rolling forecasts | Annual operating plans, monthly reviews |

## Game Development

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Game Designer | game-development/game-designer.md | Systems design, GDD, economy balancing | Game mechanics, progression systems |
| Narrative Designer | game-development/narrative-designer.md | Story systems, branching dialogue | Branching narratives, dialogue systems |
| Unity Architect | game-development/unity/unity-architect.md | ScriptableObjects, DOTS/ECS | Large-scale Unity projects |
| Unreal Systems Engineer | game-development/unreal-engine/unreal-systems-engineer.md | C++/Blueprint, GAS | Complex Unreal gameplay systems |
| Godot Gameplay Scripter | game-development/godot/godot-gameplay-scripter.md | GDScript, Godot patterns | Godot game logic and systems |

## Project Management

| Agent | Path | Specialty | When to Use |
|-------|------|-----------|-------------|
| Senior Project Manager | project-management/project-manager-senior.md | Realistic scoping, task conversion | Converting specs to tasks, scope management |
