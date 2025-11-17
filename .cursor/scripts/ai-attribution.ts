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

interface Vocabulary {
  tokenIndex: Map<string, number>;
  docFreq: number[];
  docCount: number;
}

const TOKEN_REGEX = /[a-z0-9_]+|=>|==|!=|<=|>=|&&|\|\||[\{\}\(\)\[\],.;]/gi;

function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.match(TOKEN_REGEX);
  return matches ? matches.map(token => token.toLowerCase()) : [];
}

function buildVocabulary(documents: string[]): Vocabulary {
  const tokenIndex = new Map<string, number>();
  const docFreq: number[] = [];
  
  documents.forEach(doc => {
    const tokens = new Set(tokenize(doc));
    tokens.forEach(token => {
      if (!tokenIndex.has(token)) {
        const idx = tokenIndex.size;
        tokenIndex.set(token, idx);
        docFreq[idx] = 0;
      }
      const index = tokenIndex.get(token)!;
      docFreq[index] = (docFreq[index] || 0) + 1;
    });
  });
  
  return {
    tokenIndex,
    docFreq,
    docCount: documents.length,
  };
}

/**
 * 基于统一词典的 TF-IDF 向量
 */
function vectorize(text: string, vocabulary: Vocabulary): number[] {
  const vocabSize = vocabulary.tokenIndex.size;
  if (vocabSize === 0 || vocabulary.docCount === 0) {
    return [];
  }
  
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return new Array(vocabSize).fill(0);
  }
  
  const counts: Map<number, number> = new Map();
  for (const token of tokens) {
    const index = vocabulary.tokenIndex.get(token);
    if (index === undefined) continue;
    counts.set(index, (counts.get(index) || 0) + 1);
  }
  
  const vector = new Array(vocabSize).fill(0);
  counts.forEach((count, index) => {
    const tf = count / tokens.length;
    const idf = Math.log((vocabulary.docCount + 1) / ((vocabulary.docFreq[index] || 0) + 1)) + 1;
    vector[index] = tf * idf;
  });
  
  return vector;
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

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith('//') || trimmed.startsWith('*');
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
  
  const snapshotSegments: string[] = [];
  for (const snapshot of snapshots) {
    for (const change of snapshot.changes) {
      for (const addition of change.additions) {
        if (isSkippableLine(addition)) {
          continue;
        }
        snapshotSegments.push(addition.trim());
      }
    }
  }

  const currentSegments: string[] = [];
  for (const additions of currentDiff.values()) {
    for (const addition of additions) {
      const line = addition.trim();
      if (isSkippableLine(line)) {
        continue;
      }
      currentSegments.push(line);
    }
  }

  const vocabulary = buildVocabulary([...snapshotSegments, ...currentSegments]);
  const snapshotVectors: Array<{ text: string; vector: number[] }> = snapshotSegments.map(text => ({
    text,
    vector: vectorize(text, vocabulary),
  }));
  
  console.log(`📊 分析中... 找到 ${snapshotVectors.length} 个快照代码片段`);
  
  // 分析当前 diff 中的每一行
  for (const line of currentSegments) {
    totalLines++;
    const currentVector = vectorize(line, vocabulary);
    
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
module.exports = { attributeChanges, generateCommitMessage, vectorize, cosineSimilarity, buildVocabulary, tokenize };

// ES6 导出（用于 TypeScript）
export { attributeChanges, generateCommitMessage, vectorize, cosineSimilarity, buildVocabulary, tokenize };

