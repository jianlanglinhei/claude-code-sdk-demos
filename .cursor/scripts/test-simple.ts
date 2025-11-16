#!/usr/bin/env ts-node
/**
 * 简化版 AI 归因算法测试
 */

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

function testVectorization() {
  console.log('🧪 测试向量化功能...\n');
  
  const code1 = `function hello() { return "world"; }`;
  const code2 = `function hello() { return "world"; }`;
  const code3 = `const goodbye = () => { return "farewell"; }`;
  
  const vec1 = vectorize(code1);
  const vec2 = vectorize(code2);
  const vec3 = vectorize(code3);
  
  console.log('代码片段 1:', code1);
  console.log('向量长度:', vec1.length);
  console.log('向量示例:', vec1.slice(0, 10), '...\n');
  
  const sim12 = cosineSimilarity(vec1, vec2);
  const sim13 = cosineSimilarity(vec1, vec3);
  
  console.log('相似度测试：');
  console.log(`  相同代码 (code1 vs code2): ${(sim12 * 100).toFixed(2)}%`);
  console.log(`  不同代码 (code1 vs code3): ${(sim13 * 100).toFixed(2)}%\n`);
  
  if (sim12 > 0.95) {
    console.log('✅ 相同代码检测正常');
  } else {
    console.log('❌ 相同代码检测异常');
  }
  
  if (sim13 < 0.95) {
    console.log('✅ 不同代码检测正常');
  } else {
    console.log('❌ 不同代码检测异常');
  }
}

function testCosineSimilarity() {
  console.log('\n🧪 测试余弦相似度计算...\n');
  
  // 测试边界情况
  const tests = [
    { vec1: [1, 2, 3], vec2: [1, 2, 3], expected: 1.0, name: '完全相同' },
    { vec1: [1, 0, 0], vec2: [0, 1, 0], expected: 0.0, name: '完全不同' },
    { vec1: [1, 1], vec2: [1, 1], expected: 1.0, name: '相同比例' },
    { vec1: [1, 2, 3], vec2: [2, 4, 6], expected: 1.0, name: '比例缩放' },
  ];
  
  for (const test of tests) {
    const similarity = cosineSimilarity(test.vec1, test.vec2);
    const passed = Math.abs(similarity - test.expected) < 0.01;
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${test.name}: ${(similarity * 100).toFixed(2)}% (期望: ${(test.expected * 100).toFixed(2)}%)`);
  }
}

function testRealWorldExamples() {
  console.log('\n🧪 测试真实代码示例...\n');
  
  // AI 生成的典型代码模式
  const aiCode = `
import React from 'react';

export const Component: React.FC = () => {
  const [state, setState] = React.useState(0);
  
  const handleClick = () => {
    setState(prev => prev + 1);
  };
  
  return (
    <div onClick={handleClick}>
      Count: {state}
    </div>
  );
};
  `.trim();
  
  // 相似的 AI 代码（稍微修改）
  const aiCodeSimilar = `
import React from 'react';

export const MyComponent: React.FC = () => {
  const [count, setCount] = React.useState(0);
  
  const handleIncrement = () => {
    setCount(prev => prev + 1);
  };
  
  return (
    <div onClick={handleIncrement}>
      Counter: {count}
    </div>
  );
};
  `.trim();
  
  // 完全不同的手写代码
  const humanCode = `
const x = 42;
const y = x * 2;
console.log("Result:", y);
  `.trim();
  
  const vec1 = vectorize(aiCode);
  const vec2 = vectorize(aiCodeSimilar);
  const vec3 = vectorize(humanCode);
  
  const simAI = cosineSimilarity(vec1, vec2);
  const simHuman = cosineSimilarity(vec1, vec3);
  
  console.log('AI 生成的 React 组件 vs 相似的 AI 组件:');
  console.log(`  相似度: ${(simAI * 100).toFixed(2)}%`);
  console.log(`  判定: ${simAI >= 0.85 ? 'AI 生成 ✅' : '非 AI 生成 ❌'}\n`);
  
  console.log('AI 生成的 React 组件 vs 手写代码:');
  console.log(`  相似度: ${(simHuman * 100).toFixed(2)}%`);
  console.log(`  判定: ${simHuman >= 0.85 ? 'AI 生成 ❌' : '非 AI 生成 ✅'}\n`);
  
  if (simAI >= 0.5 && simHuman < 0.5) {
    console.log('✅ 真实场景测试通过');
  } else {
    console.log('⚠️  真实场景测试需要优化');
  }
}

function main() {
  console.log('='.repeat(60));
  console.log('         AI 代码归因算法测试套件');
  console.log('='.repeat(60) + '\n');
  
  testVectorization();
  testCosineSimilarity();
  testRealWorldExamples();
  
  console.log('\n' + '='.repeat(60));
  console.log('测试完成！');
  console.log('='.repeat(60));
}

main();

