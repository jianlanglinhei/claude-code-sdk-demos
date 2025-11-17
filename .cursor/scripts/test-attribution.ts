#!/usr/bin/env ts-node
/**
 * 测试 AI 归因算法
 */

import { vectorize, cosineSimilarity, buildVocabulary } from './ai-attribution';

function testVectorization() {
  console.log('🧪 测试向量化功能...\n');
  
  const code1 = `function hello() { return "world"; }`;
  const code2 = `function hello() { return "world"; }`;
  const code3 = `const goodbye = () => { return "farewell"; }`;
  const vocab = buildVocabulary([code1, code2, code3]);
  
  const vec1 = vectorize(code1, vocab);
  const vec2 = vectorize(code2, vocab);
  const vec3 = vectorize(code3, vocab);
  
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
  
  const vocab = buildVocabulary([aiCode, aiCodeSimilar, humanCode]);
  const vec1 = vectorize(aiCode, vocab);
  const vec2 = vectorize(aiCodeSimilar, vocab);
  const vec3 = vectorize(humanCode, vocab);
  
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

if (require.main === module) {
  main();
}

