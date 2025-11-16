#!/bin/bash
# AI 智能 Commit & Push 脚本
# 自动检测 AI 生成代码并添加 Co-author

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# 进入仓库根目录
cd "$REPO_ROOT"

# 检查是否安装了 ts-node
if ! command -v ts-node &> /dev/null; then
    echo "⚠️  ts-node 未安装，使用简化版本..."
    
    # 简化版本：直接使用基于文件修改时间的启发式判断
    TOTAL_CHANGES=$(git diff --cached --numstat | awk '{sum+=$1+$2} END {print sum}')
    if [ -z "$TOTAL_CHANGES" ]; then
        TOTAL_CHANGES=$(git diff --numstat | awk '{sum+=$1+$2} END {print sum}')
    fi
    
    # 检查是否有最近的 .cursor-changes 快照
    AI_PERCENTAGE=0
    if [ -d ".cursor-changes" ]; then
        # 计算最近10分钟内的快照数量作为启发式指标
        RECENT_SNAPSHOTS=$(find .cursor-changes -name "*.json" -mmin -10 2>/dev/null | wc -l)
        if [ "$RECENT_SNAPSHOTS" -gt 0 ]; then
            # 假设最近有快照说明在使用 AI
            AI_PERCENTAGE=50
        fi
    fi
    
    # 生成 commit message
    COMMIT_MSG="chore: update files"
    
    # Git add
    git add .
    
    # 如果检测到 AI 使用，添加 co-author
    if [ "$AI_PERCENTAGE" -gt 10 ]; then
        COMMIT_MSG="${COMMIT_MSG}

Co-authored-by: vibedev-agent <vibedev-agent@alibaba-inc.com>"
        echo "✨ 检测到 AI 辅助，添加 Co-author"
    fi
    
    # Commit
    git commit -m "$COMMIT_MSG"
    
    # Push
    git push
    
    exit 0
fi

# 使用完整的 TypeScript 归因算法
echo "🚀 启动 AI 代码归因分析..."
ts-node "$SCRIPT_DIR/ai-attribution.ts"

