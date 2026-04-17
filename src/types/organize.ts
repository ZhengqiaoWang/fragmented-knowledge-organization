/**
 * AI 整理相关类型定义
 */

export type OrganizeMode = 'dedup' | 'categorize' | 'connect' | 'card';

export interface OrganizeOptions {
  mode: OrganizeMode;
  outputFolder?: string;    // 输出文件夹
  outputFileName?: string;  // 输出文件名
}

export interface OrganizedResult {
  success: boolean;
  outputFile?: string;      // 生成的文件路径
  content?: string;         // 生成的内容
  error?: string;           // 错误信息
}

export interface AIClientConfig {
  provider: 'openai' | 'ollama' | 'custom';
  apiKey?: string;
  model: string;
  baseUrl?: string;
}
