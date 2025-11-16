---
description: "智能 Commit & Push - 自动检测 AI 生成代码并添加 Co-author"
---

# AI 智能 Commit & Push

自动执行以下操作：

1. **归因分析**：使用向量化和余弦相似度算法分析代码变更
2. **统计占比**：计算 AI 生成代码在总改动中的占比
3. **智能标注**：
   - 在 commit message 中添加 AI 占比信息
   - 如果 AI 代码 > 10%，自动添加 `Co-authored-by`
4. **规范提交**：生成符合规范的 commit message
5. **一键推送**：自动执行 git add、commit、push

## 归因算法原理

- **向量化处理**：将代码转换为特征向量（字符频率、词汇频率、代码模式）
- **相似度计算**：使用余弦相似度与快照对比
- **阈值判断**：相似度 ≥ 0.85 判定为 AI 生成

---

bash ../.cursor/scripts/cp.sh