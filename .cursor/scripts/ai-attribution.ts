#!/usr/bin/env ts-node
/**
 * AI 代码归因算法
 * 用于判断提交中有多少代码来源于 AI 生成
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface ChangeSnapshot {
  timestamp: string;
  branch: string;
  changes: Array<{
    file: string;
    additions: string[];
    deletions: string[];
  }>;
}

interface AttributionResult {
  totalLines: number;
  aiGeneratedLines: number;
  aiPercentage: number;
  needsCoAuthor: boolean;
}

/**
 * 文本向量化 - 简化版本使用字符级特征
 */
function vectorize(text: string): number[] {
  const features: Map<string, number> = new Map();
  
  // 清理文本：移除空白字符但保留结构
  const cleanText = text.trim();
  
  // 提取特征：
  // 1. 字符频率
  for (const char of cleanText) {
    features.set(`char_${char}`, (features.get(`char_${char}`) || 0) + 1);
  }
  
  // 2. 词汇频率（通过空格和常见分隔符分割）
  const words = cleanText.split(/[\s\n\t{}()[\];,.<>]+/).filter(w => w.length > 0);
  for (const word of words) {
    features.set(`word_${word}`, (features.get(`word_${word}`) || 0) + 1);
  }
  
  // 3. 代码模式特征
  const patterns = [
    /function\s+\w+/g,
    /const\s+\w+/g,
    /let\s+\w+/g,
    /var\s+\w+/g,
    /import\s+.*from/g,
    /export\s+(default|const|function)/g,
    /=>/g,
    /async\s+/g,
    /await\s+/g,
  ];
  
  patterns.forEach((pattern, idx) => {
    const matches = cleanText.match(pattern);
    features.set(`pattern_${idx}`, matches ? matches.length : 0);
  });
  
  // 转换为固定长度向量
  const allKeys = Array.from(features.keys()).sort();
  return allKeys.map(key => features.get(key) || 0);
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  // 确保向量长度一致
  const maxLen = Math.max(vec1.length, vec2.length);
  const v1 = [...vec1, ...Array(maxLen - vec1.length).fill(0)];
  const v2 = [...vec2, ...Array(maxLen - vec2.length).fill(0)];
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < maxLen; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 读取最近的快照文件
 */
function loadRecentSnapshots(repoRoot: string, limit: number = 5): ChangeSnapshot[] {
  const changesDir = path.join(repoRoot, '.cursor-changes');
  
  if (!fs.existsSync(changesDir)) {
    return [];
  }
  
  const snapshots: ChangeSnapshot[] = [];
  
  // 遍历分支目录
  const branches = fs.readdirSync(changesDir).filter(f => 
    fs.statSync(path.join(changesDir, f)).isDirectory()
  );
  
  for (const branch of branches) {
    const branchDir = path.join(changesDir, branch);
    const dates = fs.readdirSync(branchDir).filter(f =>
      fs.statSync(path.join(branchDir, f)).isDirectory()
    );
    
    for (const date of dates) {
      const dateDir = path.join(branchDir, date);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dateDir, file), 'utf-8');
          const data = JSON.parse(content);
          snapshots.push({
            timestamp: data.timestamp || file,
            branch: branch,
            changes: data.changes || []
          });
        } catch (err) {
          // 跳过无效的快照文件
        }
      }
    }
  }
  
  // 按时间戳排序，取最近的 N 个
  return snapshots
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

/**
 * 获取当前 git diff
 */
function getCurrentDiff(repoRoot: string): Map<string, string[]> {
  const diffMap = new Map<string, string[]>();
  
  try {
    // 获取 staged 和 unstaged 的改动
    const diff = execSync('git diff HEAD', { 
      cwd: repoRoot, 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 
    });
    
    let currentFile = '';
    const lines = diff.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('+++')) {
        // 新文件
        currentFile = line.substring(6);
        if (!diffMap.has(currentFile)) {
          diffMap.set(currentFile, []);
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        // 新增的行
        diffMap.get(currentFile)?.push(line.substring(1));
      }
    }
  } catch (err) {
    console.error('Error getting git diff:', err);
  }
  
  return diffMap;
}

/**
 * 执行归因分析
 */
function attributeChanges(repoRoot: string, threshold: number = 0.85): AttributionResult {
  const snapshots = loadRecentSnapshots(repoRoot);
  const currentDiff = getCurrentDiff(repoRoot);
  
  let totalLines = 0;
  let aiGeneratedLines = 0;
  
  // 收集所有快照中的代码内容并向量化
  const snapshotVectors: Array<{ text: string; vector: number[] }> = [];
  
  for (const snapshot of snapshots) {
    for (const change of snapshot.changes) {
      for (const addition of change.additions) {
        if (addition.trim().length > 0) {
          const vector = vectorize(addition);
          snapshotVectors.push({ text: addition, vector });
        }
      }
    }
  }
  
  console.log(`📊 分析中... 找到 ${snapshotVectors.length} 个快照代码片段`);
  
  // 分析当前 diff 中的每一行
  for (const [file, additions] of currentDiff.entries()) {
    for (const addition of additions) {
      const line = addition.trim();
      
      // 跳过空行和注释
      if (line.length === 0 || line.startsWith('//') || line.startsWith('*')) {
        continue;
      }
      
      totalLines++;
      const currentVector = vectorize(line);
      
      // 与所有快照进行相似度比较
      let maxSimilarity = 0;
      for (const snapshot of snapshotVectors) {
        const similarity = cosineSimilarity(currentVector, snapshot.vector);
        maxSimilarity = Math.max(maxSimilarity, similarity);
        
        if (similarity >= threshold) {
          break; // 找到高相似度匹配，不需要继续
        }
      }
      
      if (maxSimilarity >= threshold) {
        aiGeneratedLines++;
      }
    }
  }
  
  const aiPercentage = totalLines > 0 ? (aiGeneratedLines / totalLines) * 100 : 0;
  const needsCoAuthor = aiPercentage > 10;
  
  return {
    totalLines,
    aiGeneratedLines,
    aiPercentage,
    needsCoAuthor
  };
}

/**
 * 生成规范化的 commit message
 */
function generateCommitMessage(repoRoot: string): string {
  try {
    const status = execSync('git status --short', { 
      cwd: repoRoot, 
      encoding: 'utf-8' 
    });
    
    const lines = status.split('\n').filter(l => l.trim());
    const modified = lines.filter(l => l.startsWith(' M')).length;
    const added = lines.filter(l => l.startsWith('A') || l.startsWith('??')).length;
    const deleted = lines.filter(l => l.startsWith(' D')).length;
    
    // 分析变更类型
    let type = 'chore';
    let scope = '';
    let description = '';
    
    const filePatterns = lines.map(l => l.substring(3));
    
    if (filePatterns.some(f => f.includes('package.json') || f.includes('package-lock.json'))) {
      type = 'chore';
      scope = 'deps';
      description = 'update dependencies';
    } else if (filePatterns.some(f => f.includes('.md'))) {
      type = 'docs';
      description = 'update documentation';
    } else if (filePatterns.some(f => f.includes('test') || f.includes('spec'))) {
      type = 'test';
      description = 'update tests';
    } else if (added > modified) {
      type = 'feat';
      description = 'add new features';
    } else if (modified > 0) {
      type = 'fix';
      description = 'update implementation';
    }
    
    const changes = [];
    if (modified > 0) changes.push(`${modified} modified`);
    if (added > 0) changes.push(`${added} added`);
    if (deleted > 0) changes.push(`${deleted} deleted`);
    
    const summary = changes.join(', ');
    
    if (scope) {
      return `${type}(${scope}): ${description}\n\n${summary}`;
    } else {
      return `${type}: ${description}\n\n${summary}`;
    }
  } catch (err) {
    return 'chore: update files';
  }
}

/**
 * 主函数
 */
function main() {
  const repoRoot = process.cwd();
  
  console.log('🔍 AI 代码归因分析启动...\n');
  
  // 检查是否有改动
  try {
    const status = execSync('git status --short', { 
      cwd: repoRoot, 
      encoding: 'utf-8' 
    });
    
    if (!status.trim()) {
      console.log('✅ 没有需要提交的改动');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ 无法检查 git 状态');
    process.exit(1);
  }
  
  // 执行归因分析
  const result = attributeChanges(repoRoot);
  
  console.log('\n📈 归因分析结果：');
  console.log(`   总改动行数: ${result.totalLines}`);
  console.log(`   AI 生成行数: ${result.aiGeneratedLines}`);
  console.log(`   AI 占比: ${result.aiPercentage.toFixed(2)}%`);
  console.log(`   需要 Co-author: ${result.needsCoAuthor ? '是' : '否'}\n`);
  
  // 生成 commit message
  let commitMessage = generateCommitMessage(repoRoot);
  
  // 添加 AI 占比信息
  if (result.totalLines > 0) {
    commitMessage += `\n\nAI-Generated: ${result.aiGeneratedLines}/${result.totalLines} lines (${result.aiPercentage.toFixed(1)}%)`;
  }
  
  // 如果 AI 生成代码超过 10%，添加 Co-authored-by
  if (result.needsCoAuthor) {
    commitMessage += '\nCo-authored-by: vibedev-agent <vibedev-agent@alibaba-inc.com>';
    console.log('✨ 自动添加 AI Co-author');
  }
  
  console.log('\n📝 Commit Message:');
  console.log('---');
  console.log(commitMessage);
  console.log('---\n');
  
  // 执行 git add
  try {
    execSync('git add .', { cwd: repoRoot, stdio: 'inherit' });
    console.log('✅ 已暂存所有改动');
  } catch (err) {
    console.error('❌ 暂存失败');
    process.exit(1);
  }
  
  // 执行 git commit
  try {
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { 
      cwd: repoRoot, 
      stdio: 'inherit' 
    });
    console.log('✅ 提交成功');
  } catch (err) {
    console.error('❌ 提交失败');
    process.exit(1);
  }
  
  // 执行 git push
  try {
    execSync('git push', { cwd: repoRoot, stdio: 'inherit' });
    console.log('✅ 推送成功');
  } catch (err) {
    console.error('❌ 推送失败，请手动执行 git push');
    process.exit(1);
  }
  
  console.log('\n🎉 完成！');
}

// 运行主函数
if (require.main === module) {
  main();
}

// CommonJS 导出
module.exports = { attributeChanges, generateCommitMessage, vectorize, cosineSimilarity };

// ES6 导出（用于 TypeScript）
export { attributeChanges, generateCommitMessage, vectorize, cosineSimilarity };

