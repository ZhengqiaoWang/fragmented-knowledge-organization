import { App, RequestUrlParam, requestUrl, TFile } from 'obsidian';
import { Fragment, KnowledgeCard, OrganizeOptions } from '../models/Fragment';
import { PluginSettings } from '../types/settings';
import { FileService } from './FileService';
import { formatDate } from '../utils/dateFormatter';

export class AIOrganizerService {
	constructor(
		private app: App,
		private settings: PluginSettings,
		private fileService: FileService
	) {}

	/**
	 * 智能整理知识碎片
	 * 流程：分类 → 生成知识卡片 → 去重合并 → 添加标签 → 发现关联
	 */
	async organize(fragments: Fragment[], options: OrganizeOptions, onProgress?: (step: number, message: string) => void): Promise<string[]> {
		console.log('[AI 整理] ========== 开始整理 ==========');
		console.log('[AI 整理] 碎片数量:', fragments.length);

		if (fragments.length === 0) {
			throw new Error('没有需要整理的碎片');
		}

		try {
			// 步骤 1: AI 分类和内容整理
			if (onProgress) onProgress(5, '步骤 1/4: AI 正在分析碎片并分类...');
			console.log('[AI 整理] 步骤 1: 开始 AI 分类...');
			const categorizedContent = await this.categorizeFragments(fragments);
			console.log('[AI 整理] 步骤 1 完成，分类数量:', categorizedContent.length);
			if (onProgress) onProgress(25, '步骤 2/4: 正在生成知识卡片...');

			// 步骤 2: 为每个分类生成知识卡片
			const createdFiles: string[] = [];
			const knowledgeCards: KnowledgeCard[] = [];

			for (let i = 0; i < categorizedContent.length; i++) {
				const category = categorizedContent[i];
				if (!category) continue;

				// 计算当前进度（基于分类进度）
				const categoryProgress = 25 + Math.floor((i + 1) / categorizedContent.length * 50);
				if (onProgress) onProgress(categoryProgress, `步骤 2/4: 正在生成知识卡片 (${i + 1}/${categorizedContent.length}): ${category.category}`);

				// 检查是否需要合并现有卡片
				let cardContent = category.content;

				if (options.autoMerge) {
					const existingCard = await this.findExistingCard(category.category, options.outputFolder);
					if (existingCard) {
						cardContent = await this.mergeCardContent(existingCard, category.content, category.title);
					}
				}

				// 提取标签
				const tags = await this.extractTags(category.content);

				// 创建知识卡片
				const card: KnowledgeCard = {
					category: category.category,
					title: category.title,
					content: cardContent,
					tags: tags,
					relatedCards: [],
					fragmentIds: fragments.map(f => f.id)
				};

				knowledgeCards.push(card);

				// 保存知识卡片文件
				const filePath = await this.saveKnowledgeCard(card, options.outputFolder);
				createdFiles.push(filePath);
			}

			if (onProgress) onProgress(75, '步骤 3/4: 正在发现知识关联...');

			// 步骤 3: 发现知识卡片之间的关联
			if (options.autoLink && knowledgeCards.length > 1) {
				await this.discoverAndLinkCards(knowledgeCards, options.outputFolder);
			}

			if (onProgress) onProgress(85, '步骤 4/4: 正在更新碎片状态...');

			// 步骤 4: 标记碎片为已处理（带详细进度）
			for (let i = 0; i < fragments.length; i++) {
				const fragment = fragments[i];
				if (!fragment) continue;
				
				const progress = 85 + Math.floor((i + 1) / fragments.length * 15);
				const date = new Date(fragment.timestamp);
				const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
				const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
				
				if (onProgress) onProgress(progress, `步骤 4/4: 更新碎片状态 (${i + 1}/${fragments.length}): ${dateStr} ${timeStr}`);
				
				try {
					await this.markFragmentAsProcessed(fragment);
				} catch (error) {
					console.error(`[AI 整理] 标记碎片失败：${fragment.id}`, error);
				}
			}

			if (onProgress) onProgress(100, '✅ 整理完成！');

			console.log('[AI 整理] ========== 整理完成 ==========');
			console.log('[AI 整理] 创建的文件:', createdFiles);
			return createdFiles;
		} catch (error) {
			console.error('[AI 整理] ========== 整理失败 ==========');
			console.error('[AI 整理] 错误:', error);
			throw error;
		}
	}

	/**
	 * 标记单个碎片为已处理
	 */
	private async markFragmentAsProcessed(fragment: Fragment): Promise<void> {
		const date = new Date(fragment.timestamp);
		const dateFolder = await this.fileService.getDateFolderIfExists(date);
		if (!dateFolder) {
			console.log('[AI 状态] 日期文件夹不存在:', date.toISOString());
			return;
		}

		const datePrefix = `${dateFolder.path}/`;
		const allFiles = this.app.vault.getFiles();
		
		// 筛选该日期文件夹下的所有碎片文件
		const candidateFiles = allFiles.filter(file =>
			file.path.startsWith(datePrefix) &&
			file.extension === 'md' &&
			!file.path.includes(this.fileService.settings.attachmentFolder) &&
			!file.name.endsWith('知识碎片.md')
		);
		
		console.log('[AI 状态] 查找碎片文件，候选文件数量:', candidateFiles.length);

		// 尝试通过文件名匹配时间
		// 文件名格式：HH-MM-类型.md (例如：10-30-文本.md)
		const fragmentHours = String(date.getHours()).padStart(2, '0');
		const fragmentMinutes = String(date.getMinutes()).padStart(2, '0');
		
		const fragmentFile = candidateFiles.find(file => {
			const nameMatch = file.name.match(/^(\d{2})-(\d{2})-/);
			if (!nameMatch) return false;
			return nameMatch[1] === fragmentHours && nameMatch[2] === fragmentMinutes;
		});

		if (fragmentFile) {
			console.log('[AI 状态] 找到碎片文件:', fragmentFile.path);
			await this.fileService.updateFragmentStatus(fragmentFile, 'processed');
			console.log('[AI 状态] 已标记为已处理:', fragmentFile.path);
		} else {
			console.log('[AI 状态] 未找到匹配的碎片文件，候选文件:', candidateFiles.map(f => f.name));
		}
	}

	/**
	 * 标记碎片为已处理
	 */
	private async markFragmentsAsProcessed(fragments: Fragment[]): Promise<void> {
		for (const fragment of fragments) {
			try {
				// 查找碎片文件
				const dateFolder = await this.fileService.getDateFolderIfExists(new Date(fragment.timestamp));
				if (!dateFolder) continue;
				
				const datePrefix = `${dateFolder.path}/`;
				const allFiles = this.app.vault.getFiles();
				const fragmentFile = allFiles.find(file => 
					file.path.startsWith(datePrefix) && 
					file.extension === 'md' &&
					!file.path.includes(this.fileService.settings.attachmentFolder) &&
					!file.name.endsWith('知识碎片.md')
				);
				
				if (fragmentFile) {
					await this.fileService.updateFragmentStatus(fragmentFile, 'processed');
					console.log(`[AI 整理] 标记碎片已处理：${fragmentFile.path}`);
				}
			} catch (error) {
				console.error(`[AI 整理] 标记碎片失败：${fragment.id}`, error);
			}
		}
	}

	/**
	 * 步骤 1: AI 分类碎片
	 */
	private async categorizeFragments(fragments: Fragment[]): Promise<Array<{
		category: string;
		title: string;
		content: string;
	}>> {
		console.log('[AI 分类] 开始构建碎片文本...');
		const fragmentText = fragments.map(f => {
			const time = new Date(f.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
			return `[${time}] ${f.type === 'text' ? '文本' : f.type === 'link' ? '链接' : '图片'}: ${f.content}`;
		}).join('\n');

		console.log('[AI 分类] 碎片文本长度:', fragmentText.length);
		console.log('[AI 分类] 碎片文本预览:', fragmentText.substring(0, 200));

		// 检查是否使用自定义分类
		let prompt = '';
		
		if (this.settings.useCustomCategories && this.settings.customCategories.length > 0) {
			// 构建自定义分类提示
			const categoriesText = this.settings.customCategories.map(cat => {
				const subText = cat.subTags?.length ? 
					` 子标签：${cat.subTags.map(s => `${s.name}${s.description ? ` (${s.description})` : ''}`).join(', ')}` : '';
				return `- ${cat.name}${subText}${cat.description ? ` - ${cat.description}` : ''}`;
			}).join('\n');

			prompt = `请分析以下知识碎片，按照我定义的标签体系进行分类：

【标签体系】
${categoriesText}

【知识碎片】
${fragmentText}

请以 JSON 格式返回分类结果，格式如下：
{
  "categories": [
    {
      "category": "分类名称（必须从上方标签体系中选择）",
      "title": "知识卡片标题",
      "content": "整理后的详细内容，包含所有相关碎片的整合信息"
    }
  ]
}

要求：
1. 分类名称必须从上方标签体系中选择，不要创建新的分类
2. 根据内容主题自动匹配最合适的分类
3. 每个分类生成一个清晰的知识卡片标题
4. 内容要结构完整，逻辑清晰
5. 如果碎片不属于任何分类，归类到"其他"`;
		} else {
			// 使用默认的自由分类
			prompt = `请分析以下知识碎片，按主题分类并整理：

${fragmentText}

请以 JSON 格式返回分类结果，格式如下：
{
  "categories": [
    {
      "category": "分类名称",
      "title": "知识卡片标题",
      "content": "整理后的详细内容，包含所有相关碎片的整合信息"
    }
  ]
}

要求：
1. 根据内容主题自动分类，合并相似内容
2. 每个分类生成一个清晰的知识卡片标题
3. 内容要结构完整，逻辑清晰
4. 如果所有碎片都属于同一主题，只返回一个分类`;
		}

		console.log('[AI 分类] 调用 AI API...');
		const response = await this.callAI(prompt);
		console.log('[AI 分类] AI 响应收到，长度:', response.length);
		console.log('[AI 分类] AI 响应预览:', response.substring(0, 300));

		try {
			// 提取 JSON（可能包含在 markdown 代码块中）
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || [null, response];
			console.log('[AI 分类] JSON 提取成功');
			const data = JSON.parse(jsonMatch[1]);

			if (!data.categories || !Array.isArray(data.categories)) {
				console.error('[AI 分类] AI 返回格式不正确:', data);
				throw new Error('AI 返回格式不正确');
			}

			console.log('[AI 分类] 分类解析成功:', data.categories.length);
			return data.categories;
		} catch (parseError) {
			console.error('[AI 分类] 解析 AI 响应失败:', parseError);
			console.log('[AI 分类] AI 原始响应:', response);

			// 降级处理：所有碎片作为一个分类
			console.log('[AI 分类] 使用降级处理');
			return [{
				category: '未分类',
				title: '知识碎片整理',
				content: response
			}];
		}
	}

	/**
	 * 步骤 2: 查找现有知识卡片
	 */
	private async findExistingCard(category: string, outputFolder?: string): Promise<TFile | null> {
		const folder = outputFolder || '知识体系';
		const possibleNames = [
			`${category}.md`,
			`${category.replace(/\s+/g, '-')}.md`,
			`${category.replace(/\s+/g, '_')}.md`
		];

		for (const name of possibleNames) {
			const filePath = `${folder}/${name}`;
			const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
			if (file) return file;
		}

		return null;
	}

	/**
	 * 步骤 2: 合并现有卡片内容
	 */
	private async mergeCardContent(existingFile: TFile, newContent: string, title: string): Promise<string> {
		const existingContent = await this.app.vault.read(existingFile);
		
		const prompt = `现有知识卡片内容：

${existingContent}

新的碎片整理内容：

${newContent}

请将新旧内容合并，去重并整合成一个完整的知识卡片。

要求：
1. 保留原有内容的核心信息
2. 补充新的知识点
3. 去除重复内容
4. 保持结构清晰
5. 直接返回合并后的完整内容，不要额外说明`;

		return await this.callAI(prompt);
	}

	/**
	 * 步骤 2: 提取标签
	 */
	private async extractTags(content: string): Promise<string[]> {
		const prompt = `请从以下知识内容中提取 3-5 个关键词作为标签：

${content.substring(0, 1000)}

只返回 JSON 数组格式，例如：["标签 1", "标签 2", "标签 3"]`;

		console.log('[AI 标签] 调用 AI API 提取标签...');
		try {
			const response = await this.callAI(prompt);
			console.log('[AI 标签] AI 响应收到:', response.substring(0, 100));
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || [null, response];
			const tags = JSON.parse(jsonMatch[1]);

			if (Array.isArray(tags)) {
				console.log('[AI 标签] 标签提取成功:', tags);
				return tags;
			}
		} catch (error) {
			console.log('[AI 标签] 自动提取标签失败，使用默认标签');
		}

		// 默认标签
		console.log('[AI 标签] 使用默认标签：知识碎片');
		return ['知识碎片'];
	}

	/**
	 * 步骤 2: 保存知识卡片
	 */
	private async saveKnowledgeCard(card: KnowledgeCard, outputFolder?: string): Promise<string> {
		const folder = outputFolder || '知识体系';
		const categoryFolder = `${folder}/${card.category}`;
		const attachmentsFolder = `${categoryFolder}/附件`;

		// 创建分类目录和附件目录
		let categoryDir = this.app.vault.getAbstractFileByPath(categoryFolder);
		if (!categoryDir) {
			await this.app.vault.createFolder(categoryFolder);
		}

		let attachmentsDir = this.app.vault.getAbstractFileByPath(attachmentsFolder);
		if (!attachmentsDir) {
			await this.app.vault.createFolder(attachmentsFolder);
		}

		// 复制图片到知识体系的附件目录
		const content = await this.copyImagesToCategory(card.content);

		// 生成文件名
		const safeTitle = card.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-');
		const fileName = `${safeTitle}.md`;
		const filePath = `${categoryFolder}/${fileName}`;

		// 构建 Markdown 内容（带 frontmatter）
		const tagsYaml = card.tags.map(t => `  - ${t}`).join('\n');
		const markdown = `---
title: "${card.title}"
tags:
${tagsYaml}
category: ${card.category}
created: "${new Date().toISOString()}"
---

# ${card.title}

${content}
`;

		await this.app.vault.create(filePath, markdown);
		return filePath;
	}

	/**
	 * 复制图片到知识体系附件目录
	 */
	private async copyImagesToCategory(content: string): Promise<string> {
		console.log('[AI 图片] 开始处理图片，内容长度:', content.length);
		
		// 查找所有图片链接 ![](path)
		const imageRegex = /!\[\]\((.+?)\)/g;
		let newContent = content;
		const matches = [...content.matchAll(imageRegex)];
		
		console.log('[AI 图片] 找到图片数量:', matches.length);

		for (const match of matches) {
			const oldPath = match[1];
			if (!oldPath) continue;
			
			console.log('[AI 图片] 处理图片:', oldPath);

			try {
				// 读取原图片 - 尝试多种路径格式
				let oldFile: TFile | null = null;
				
				// 尝试直接路径
				oldFile = this.app.vault.getAbstractFileByPath(oldPath) as TFile;
				
				// 如果是相对路径，尝试从 vault 根目录查找
				if (!oldFile && !oldPath.startsWith('/')) {
					oldFile = this.app.vault.getAbstractFileByPath(oldPath) as TFile;
				}
				
				if (!oldFile) {
					console.log('[AI 图片] 未找到文件:', oldPath);
					continue;
				}
				
				if (!(oldFile instanceof TFile)) {
					console.log('[AI 图片] 不是有效文件:', oldPath);
					continue;
				}

				console.log('[AI 图片] 找到文件，开始读取:', oldFile.path);
				const imageData = await this.app.vault.readBinary(oldFile);

				// 保存到知识体系附件目录
				const fileName = oldFile.name;
				const categoryFolder = `知识体系/附件`;
				const newPath = `${categoryFolder}/${fileName}`;

				// 确保目标文件夹存在
				let targetDir = this.app.vault.getAbstractFileByPath(categoryFolder);
				if (!targetDir) {
					console.log('[AI 图片] 创建文件夹:', categoryFolder);
					await this.app.vault.createFolder(categoryFolder);
				}

				// 如果文件已存在，使用唯一名称
				let finalPath = newPath;
				const existingFile = this.app.vault.getAbstractFileByPath(newPath);
				if (existingFile) {
					const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
					const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
					const timestamp = Date.now();
					finalPath = `${categoryFolder}/${baseName}-${timestamp}.${ext}`;
					console.log('[AI 图片] 文件已存在，使用新名称:', finalPath);
				}

				console.log('[AI 图片] 保存图片到:', finalPath);
				await this.app.vault.createBinary(finalPath, imageData);

				// 更新图片路径为相对路径
				const relativePath = `附件/${finalPath.split('/').pop()}`;
				console.log('[AI 图片] 新路径:', relativePath);
				newContent = newContent.replace(match[0], `![](${relativePath})`);
			} catch (error) {
				console.error('[AI 图片] 复制图片失败:', oldPath, error);
			}
		}

		return newContent;
	}

	/**
	 * 步骤 3: 发现并建立知识卡片关联
	 */
	private async discoverAndLinkCards(cards: KnowledgeCard[], outputFolder?: string): Promise<void> {
		const folder = outputFolder || '知识体系';
		
		// 构建所有卡片的内容摘要
		const cardSummaries = cards.map(card => ({
			title: card.title,
			category: card.category,
			content: card.content.substring(0, 500)
		}));

		// AI 分析关联
		const prompt = `分析以下知识卡片之间的关联：

${cardSummaries.map(c => `### ${c.title} (${c.category})\n${c.content}`).join('\n\n')}

请找出哪些卡片之间存在关联关系，返回 JSON 格式：
{
  "links": [
    {
      "from": "卡片 1 标题",
      "to": "卡片 2 标题",
      "reason": "关联原因说明"
    }
  ]
}`;

		try {
			const response = await this.callAI(prompt);
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || [null, response];
			const data = JSON.parse(jsonMatch[1]);

			if (data.links && Array.isArray(data.links)) {
				// 为每个卡片添加关联链接
				for (const card of cards) {
					const relatedTitles = data.links
						.filter((l: { from: string; to: string }) => l.from === card.title || l.to === card.title)
						.map((l: { from: string; to: string }) => l.from === card.title ? l.to : l.from);

					if (relatedTitles.length > 0) {
						await this.addLinksToCard(card, relatedTitles, folder);
					}
				}
			}
		} catch (error) {
			console.log('自动发现关联失败:', error);
		}
	}

	/**
	 * 为卡片添加关联链接
	 */
	private async addLinksToCard(card: KnowledgeCard, relatedTitles: string[], outputFolder: string): Promise<void> {
		const filePath = `${outputFolder}/${card.category}/${card.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}.md`;
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

		if (!file) return;

		const content = await this.app.vault.read(file);
		const links = relatedTitles.map(title => `- [[${title}]]`).join('\n');
		const linkSection = `\n## 相关知识\n\n${links}`;

		// 在文件末尾添加关联（在 frontmatter 之后）
		const newContent = content.trimEnd() + linkSection + '\n';
		await this.app.vault.modify(file, newContent);
	}

	/**
	 * 调用 AI API
	 */
	private async callAI(prompt: string): Promise<string> {
		console.log('[AI API] ========== 开始调用 ==========');
		let url = this.settings.baseUrl || 'https://api.openai.com/v1/chat/completions';

		// 确保 URL 格式正确
		if (!url.includes('/chat/completions') && !url.includes('/v1/')) {
			url = `${url.endsWith('/') ? url.slice(0, -1) : url}/chat/completions`;
		}
		url = url.replace(/\/+$/, '');

		console.log('[AI API] URL:', url);
		console.log('[AI API] 模型:', this.settings.model || 'gpt-4');
		console.log('[AI API] Prompt 长度:', prompt.length);

		const requestParams: RequestUrlParam = {
			url: url,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.apiKey || ''}`
			},
			body: JSON.stringify({
				model: this.settings.model || 'gpt-4',
				messages: [
					{ role: 'system', content: '你是一个知识管理专家，擅长对碎片化信息进行结构化整理、分类和关联分析。' },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7
			})
		};

		try {
			console.log('[AI API] 发送请求...');
			const response = await requestUrl(requestParams);
			console.log('[AI API] 收到响应，状态:', response.status);
			const data = response.json;

			if (!data.choices || !data.choices[0]) {
				console.error('[AI API] 响应格式错误:', data);
				throw new Error('API 响应格式不正确');
			}

			const content = data.choices[0].message.content;
			console.log('[AI API] 响应内容长度:', content?.length);
			console.log('[AI API] ========== 调用完成 ==========');
			return content;
		} catch (error) {
			console.error('[AI API] ========== 调用失败 ==========');
			if (error instanceof Error) {
				console.error('[AI API] 错误详情:', error.message);
				if (error.message.includes('404')) {
					throw new Error(`API 地址不存在 (404)。请检查：\n1. 基础 URL 是否正确\n2. AI 网关服务是否正常运行\n3. 网络连接是否正常`);
				}
				throw new Error(`OpenAI API 调用失败：${error.message}`);
			}
			throw new Error('OpenAI API 调用失败');
		}
	}
}
