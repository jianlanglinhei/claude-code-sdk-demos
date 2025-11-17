# Cursor AI 归因系统

这个目录包含了智能的 AI 代码归因和自动提交系统。

## 功能特性

### 🤖 AI 代码归因算法

自动识别提交中有多少代码来源于 AI 生成，核心原理：

1. **向量化处理**
   - 将代码变更和快照内容进行分词和特征提取
   - 提取字符频率、词汇频率、代码模式等特征
   - 转换为高维特征向量

2. **相似度计算**
   - 使用余弦相似度算法衡量代码片段相似度
   - 相似度范围 0-1，越接近 1 表示越相似
   - 与历史快照中的 AI 生成代码进行对比

3. **阈值判断**
   - 相似度 ≥ 0.85：判定为 AI 生成
   - 统计 AI 生成代码占比
   - 自动决定是否添加 Co-author

### 📝 Slash Commands

#### `/cp` - 智能 Commit & Push

一键提交并推送，自动处理 AI 归因：

```bash
/cp
```

**工作流程：**

1. ✅ 统计本次代码改动行数
2. 🔍 分析与 `.cursor-changes` 快照的相似度
3. 📊 计算 AI 生成代码占比
4. ✨ 如果 AI 改动 > 10%，自动添加：
   ```
   Co-authored-by: vibedev-agent <vibedev-agent@alibaba-inc.com>
   ```
5. 📦 生成规范化的 commit message
6. 🚀 自动执行 `git add` + `git commit` + `git push`

## 目录结构

```
.cursor/
├── commands/
│   └── cp.md              # /cp 命令定义
├── scripts/
│   ├── ai-attribution.ts  # 归因算法核心实现
│   └── cp.sh             # Commit & Push 脚本入口
└── README.md             # 本文档
```

## 技术细节

### 向量化特征

归因算法提取以下特征构建代码向量：

- **字符级特征**：每个字符的出现频率
- **词汇特征**：标识符、关键字的频率
- **模式特征**：
  - `function` 声明
  - `const/let/var` 变量声明
  - `import/export` 语句
  - 箭头函数 `=>`
  - `async/await` 模式

### 余弦相似度公式

```
similarity = (A · B) / (||A|| × ||B||)
```

其中：
- `A · B`：向量点积
- `||A||`：向量 A 的模长
- `||B||`：向量 B 的模长

### 快照系统

归因算法依赖 `.cursor-changes` 目录中的快照：

```
.cursor-changes/
└── main/
    └── 2025-11-16/
        ├── changes_20251116_231757.json
        └── changes_20251116_231757.diff
```

每个快照记录：
- 时间戳
- 分支名
- 文件变更列表
- 添加/删除的具体代码行

> 系统默认只消费最近 4 小时内的快照，过期记录会被忽略以避免陈旧数据干扰判定。如果在该时间窗口内找不到任何快照，会回退为“本次改动全部视为 AI 生成”的策略，宁可多标也不漏标。

## 使用示例

### 场景 1：AI 辅助编写功能

```bash
# 使用 Cursor AI 编写了新功能
# 运行智能提交
/cp

# 输出：
# 🔍 AI 代码归因分析启动...
# 📊 分析中... 找到 156 个快照代码片段
# 
# 📈 归因分析结果：
#    总改动行数: 120
#    AI 生成行数: 85
#    AI 占比: 70.83%
#    需要 Co-author: 是
# 
# ✨ 自动添加 AI Co-author
# 
# 📝 Commit Message:
# ---
# feat: add new feature
# 
# AI-Generated: 85/120 lines (70.8%)
# Co-authored-by: vibedev-agent <vibedev-agent@alibaba-inc.com>
# ---
# 
# ✅ 已暂存所有改动
# ✅ 提交成功
# ✅ 推送成功
# 🎉 完成！
```

### 场景 2：手动修改代码

```bash
# 手动修改了几行代码
/cp

# 输出：
# 📈 归因分析结果：
#    总改动行数: 15
#    AI 生成行数: 0
#    AI 占比: 0.00%
#    需要 Co-author: 否
# 
# 📝 Commit Message:
# ---
# fix: resolve issue
# 
# AI-Generated: 0/15 lines (0.0%)
# ---
# 
# ✅ 提交成功（不添加 Co-author）
```

## 配置

### 调整相似度阈值

编辑 `scripts/ai-attribution.ts`：

```typescript
function attributeChanges(
  repoRoot: string, 
  threshold: number = 0.85  // 调整这个值
): AttributionResult {
  // ...
}
```

推荐值：
- `0.90`：更严格，减少误判
- `0.85`：平衡（默认）
- `0.80`：更宽松，捕获更多 AI 代码

### 调整 Co-author 阈值

编辑 `scripts/ai-attribution.ts`：

```typescript
const needsCoAuthor = aiPercentage > 10; // 调整为其他百分比
```

## 依赖

- **Node.js** >= 14
- **TypeScript** (可选，用于完整功能)
- **ts-node** (可选，用于直接运行 TS 脚本)

如果未安装 `ts-node`，系统会自动降级到简化版本（基于文件时间戳的启发式判断）。

## 注意事项

1. **首次使用**：需要先产生一些快照数据，建议在使用 AI 编辑代码后等待自动快照生成
2. **准确性**：归因算法基于相似度，可能存在误判，建议人工审核重要提交
3. **性能**：大量快照会影响分析速度，系统默认只分析最近 5 个快照
4. **隐私**：快照数据存储在本地，不会上传到远程

## 故障排查

### 问题：没有检测到 AI 代码

**原因**：可能是快照数据不足

**解决**：
```bash
# 检查快照目录
ls -la .cursor-changes/

# 确保 .gitignore 不包含 .cursor-changes（用于分析）
# 但不要提交这个目录到仓库
```

### 问题：误判过多

**原因**：阈值设置不合适

**解决**：调高相似度阈值至 0.90 或更高

### 问题：脚本执行失败

**解决**：
```bash
# 检查权限
chmod +x .cursor/scripts/cp.sh

# 手动运行查看错误
bash .cursor/scripts/cp.sh
```

## 贡献

欢迎提交 Issue 和 Pull Request 来改进归因算法！

## License

MIT

