# 新返航录 · 蒙特卡洛对抗报告

> 生成：2026-11-02T14:26:23.923Z · 局数：1000 / 1000 · seed：20261030 · dt：0.1 · 上限：15 夜

## 胜率

| 阵营 | 胜局 | 胜率 |
|---|---:|---:|
| 人类 | 565 | 56.5% |
| 异形 | 430 | 43% |
| 超时未决 | 5 | 0.5% |

人类胜率 95% Wilson 区间：53.41% ~ 59.54%

## 结束原因

- timeout：5
- 人类全灭：430
- 异形全部出局：321
- 维修 45 分达成：244

## 每局均值 / 中位数

| 指标 | 均值 | 中位数 |
|---|---:|---:|
| nights | 5.809 | 5 |
| prog | 31.911 | 34 |
| steps | 4256.894 | 3750 |
| meetings | 12.088 | 12 |
| knives | 11.076 | 11 |
| shots | 2.084 | 2 |
| sabotages | 10.876 | 11 |
| exiles | 3.49 | 3 |
| humanExiles | 1.552 | 1 |
| alienExiles | 1.938 | 2 |
| searches | 6.68 | 6 |
| loots | 3.738 | 3 |
| bulletsLooted | 0.475 | 0 |
| medkitsLooted | 1.214 | 1 |
| qualsLooted | 2.481 | 2 |
| humanLoots | 3.854 | 4 |
| alienLoots | 2.826 | 3 |
| humanShots | 0.49 | 0 |
| alienShots | 1.594 | 1 |
| fakeRepairs | 1.025 | 1 |
| fakeTasks | 4.229 | 4 |
| alienTasks | 0.548 | 0 |
| revives | 0.595 | 0 |
| alienPipes | 6.679 | 6 |
| alienPipePlans | 11.484 | 11 |
| humans | 3.856 | 4 |
| aliens | 0.962 | 1 |
| downed | 0.273 | 0 |
| medbotRevives | 5.579 | 5 |
| medkitRevives | 0.595 | 0 |
| ghostTasks | 8.711 | 9 |
| ghostFixes | 0 | 0 |
| humanDefends | 10.117 | 10 |
| reportDoubts | 1.248 | 1 |
| sabHits | 2.156 | 1 |
| sabFixed | 8.316 | 8 |
| sabFixSec | 19.721 | 19.7 |
| sabFixedByGhost | 0 | 0 |
| contradictions | 49.335 | 49 |
| falseContradictions | 16.85 | 16 |
| contradictionOld | 169.859 | 165 |
| knownWrites | 7.967 | 8 |
| knownVotes | 2.913 | 3 |
| ejectByKnown | 1.699 | 2 |
| detainWitness | 0.032 | 0 |
| detainEvictions | 0.024 | 0 |
| susCarry | 39.587 | 38.835 |
| almostCount | 5.245 | 5 |
| almostFriendCount | 0.305 | 0 |
| almostEject | 0.961 | 1 |
| almostVotes | 4.881 | 4 |
| overriddenFriends | 0 | 0 |
| reliaWrites | 105.642 | 105 |
| reliaSpread | 0.45 | 0.449 |
| hedgeAgents | 70.352 | 69 |
| sureAgents | 19.268 | 19 |
| silentSus | 13.219 | 12 |
| presenceDeny | 4.043 | 3 |
| claimRecall | 0 | 0 |
| retractCount | 1.218 | 1 |
| avoidCount | 71.146 | 0 |
| farSight | 3.121 | 3 |
| allyRevealed | 0.129 | 0 |
| friendShield | 0.011 | 0 |
| avoidSus | 0.351 | 0 |
| reportsUsed | 7.115 | 7 |
| nightMeetFull | 0 | 0 |

## 本轮新增统计（2026-10-31）

| 指标 | 每局均值 | 说明 |
|---|---:|---|
| medbotRevives | 5.579 | 医疗无人机飞过去近身救治的次数（3 秒/次，每夜 2 次电量） |
| medkitRevives | 0.595 | 医疗包施救次数（与 revives 同源） |
| ghostTasks | 8.711 | 幽灵完成的维修任务个数（每人额度 2 分） |
| ghostFixes | 0 | 幽灵修好的故障次数 |
| humanDefends | 10.117 | 人类 AI 公开替人辩护的次数（新行为） |
| reportDoubts | 1.248 | 异形质疑「尸体还热就报案」的次数（新行为） |

## 推理质量（2026-11-01：时间线拆谎量词 / 拘留证据 / 确证链路）

| 指标 | 每局均值 | 说明 |
|---|---:|---|
| contradictions | 49.335 | 口供对不上触发次数（修量词后应显著下降） |
| contradictionOld | 169.859 | 同一份记忆下**旧量词**会成立多少次（诊断口径，只统计不改行为） |
| falseContradictions | 16.85 | 窗口内其实有匹配记录、旧量词会冤枉人的次数 |
| knownWrites | 7.967 | 确证写入次数（出刀/管道/破坏/停摆/红身/拉闸） |
| knownVotes | 2.913 | 由确证驱动的票数 |
| ejectByKnown | 1.699 | 至少一票来自确证的驱逐次数 |
| detainWitness | 0.032 | 保安拘留被看见的次数 |
| detainEvictions | 0.024 | 被拘留过的人最终被驱逐的次数 |

## 推理引擎规范化（2026-11-01：跨夜痕迹 / 准-确证 / 可信度 / 熵沉默）

| 指标 | 每局均值 | 说明 |
|---|---:|---|
| susCarry | 39.587 | 跨夜保留下来的嫌疑总量（验改动 A） |
| almostCount | 5.245 | almost.foe 产生次数（准-确证 · 敌） |
| almostFriendCount | 0.305 | almost.friend 产生次数（准-确证 · 友，异形伪装的兑现口） |
| almostEject | 0.961 | 至少一票由准-确证驱动（≠确证）的驱逐次数 |
| almostVotes | 4.881 | 投给 almost.foe 的票数 |
| overriddenFriends | 0 | known 硬覆盖掉 almost.friend 的次数（friend 本身只有 0.26 次/局，所以这条接近 0；门禁里有专门用例） |
| reliaWrites | 105.642 | 证言可信度写入次数（追责回写） |
| reliaSpread | 0.45 | 局末可信度极差（0=谁说话都一样值钱） |
| hedgeAgents | 70.352 | 高熵（谁都像）→ 犹豫不点名的席次数 |
| sureAgents | 19.268 | 低熵（一人独高）→ 敢点名的席次数 |
| silentSus | 13.219 | 沉默线索触发次数（上限 0.10，不升级） |
| presenceDeny | 4.043 | 在场反驳「我当时就在那儿」次数 |
| claimRecall | 0 | 跨夜口供被指出不一致的次数（**纯台词侧**：sim 不排台词，所以恒为 0；真实对局才有） |
| retractCount | 1.218 | 「我上次看走眼了」次数 |
| avoidCount | 71.146 | 夜里主动躲开「咬我最狠的人」次数（行为回流） |
| farSight | 3.121 | 远距离目击（>4.5 格）次数——这些**只加嫌疑、不写确证**（证据分级） |
| allyRevealed | 0.129 | 反复替翻车者辩护被连坐的次数（软联盟） |
| friendShield | 0.011 | 「基本是好人」挡下来的票数（伪装兑现口） |
| avoidSus | 0.351 | 「他刚才绕开了我」被记成弱证据的次数 |
| reportsUsed | 7.115 | 夜晚报告实际用掉几次（额度 2 次/人） |
| nightMeetFull | 0 | 因「本夜会议已开满」被拒的报告次数 |

## 破坏技能探查（2026-11-01）

| 指标 | 数值 | 说明 |
|---|---:|---|
| 每局机会 | 23.2 | 4 异形 × 夜数 × 每夜 1 次 |
| 每局下手 | 10.876 | 使用率 46.8% |
| 每局命中（-5 生效） | 2.156 | 命中率 19.8% |
| 每局被修掉 | 8.316 | 平均存活 19.7 秒（上限 30） |
| 其中幽灵抢修 | 0 | 幽灵修复额度被故障吃掉多少 |

## 分任务点完成次数（每局平均 · 由少到多）

> 只统计、不干预。用来回答「电路维修是不是几乎没人做」这类分布问题：
> 若某个点的完成次数明显低于同难度其它点，说明问题在可达性/AI 意愿，而不是任务本身。

| 任务点 | 每局完成次数 |
|---|---:|
| 零件台 | 1.011 |
| 出库扫描 | 1.019 |
| 货箱封条 | 1.022 |
| 操作台 | 1.023 |
| 药柜 | 1.026 |
| 备用配电盘 | 1.026 |
| 库存盘点 | 1.033 |
| 温控面板 | 1.034 |
| 培养罐补液 | 1.037 |
| 娱乐桌 | 1.048 |
| 工具架 | 1.058 |
| 弹药清点 | 1.061 |
| 录像归档 | 1.066 |
| 工作台 | 1.07 |
| 消毒循环 | 1.079 |
| 点唱机 | 1.091 |
| 餐台清洁 | 1.111 |
| 后厨盘点 | 1.134 |
| 靶道校准 | 1.361 |
| 引擎组同步 | 1.39 |
| 货架校准 | 1.406 |
| 变压器换芯 | 1.432 |
| 监控墙重连 | 1.435 |
| 电路维修 | 1.439 |
| 手术台校准 | 1.474 |
| 氧气循环 | 1.484 |

## 方法说明

- 夜会议按 30 秒扣夜；白天会议不占夜。
- 讨论台词不逐条播放，会议决策与传闻嫌疑在开会时同步结算。
- 跳过渲染/HUD/音效/自动不变量；对局逻辑与正式版一致。
- 统计口径：searches/loots 为搜尸次数与真正取到物资的次数；humanLoots/alienLoots 按阵营拆分；alienPipes 为实际钻管道次数，fakeRepairs/fakeTasks 为异形假装维修与假装做任务次数，alienTasks 为真做任务次数。
