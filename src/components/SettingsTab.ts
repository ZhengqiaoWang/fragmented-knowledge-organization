import { App, PluginSettingTab, Setting, MarkdownView, Notice } from 'obsidian';
import { FragmentedKnowledgeOrgPlugin } from '../main';
import { PluginSettings, DEFAULT_SETTINGS, AIProvider, CategoryTag, SubTag } from '../types/settings';
import { CategoryEditorModal } from './CategoryEditorModal';

export class SettingsTab extends PluginSettingTab {
	plugin: FragmentedKnowledgeOrgPlugin;

	constructor(app: App, plugin: FragmentedKnowledgeOrgPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const header = containerEl.createEl('h2');
		header.setText('⚙️ 知识碎片插件设置');

		// 存储设置
		new Setting(containerEl)
			.setHeading()
			.setName('📁 存储设置');

		new Setting(containerEl)
			.setName('碎片文件夹路径')
			.setDesc('知识碎片存储的文件夹路径')
			.addText(text => text
				.setPlaceholder('知识碎片')
				.setValue(this.plugin.settings.fragmentFolder)
				.onChange(async value => {
					this.plugin.settings.fragmentFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('文件命名模板')
			.setDesc('支持变量：{日期} {年月} {星期}')
			.addText(text => text
				.setPlaceholder('{日期} 知识碎片')
				.setValue(this.plugin.settings.fileNameTemplate)
				.onChange(async value => {
					this.plugin.settings.fileNameTemplate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('附件文件夹名称')
			.setDesc('图片等附件存储的子文件夹名称')
			.addText(text => text
				.setPlaceholder('附件')
				.setValue(this.plugin.settings.attachmentFolder)
				.onChange(async value => {
					this.plugin.settings.attachmentFolder = value;
					await this.plugin.saveSettings();
				}));

		// AI 设置
		new Setting(containerEl)
			.setHeading()
			.setName('🤖 AI 设置');

		new Setting(containerEl)
			.setName('AI 提供商')
			.setDesc('选择使用的 AI 服务')
			.addDropdown(dropdown => {
				dropdown
					.addOption('openai', 'OpenAI')
					.addOption('ollama', 'Ollama')
					.addOption('custom', '自定义 API')
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async value => {
						this.plugin.settings.aiProvider = value as AIProvider;
						await this.plugin.saveSettings();
						this.display(); // 重新渲染以显示不同的配置项
					});
			});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('您的 AI API 密钥')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async value => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('模型名称')
			.setDesc(this.getModelDescription())
			.addText(text => text
				.setPlaceholder(this.getModelPlaceholder())
				.setValue(this.plugin.settings.model)
				.onChange(async value => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('基础 URL（可选）')
			.setDesc(this.getBaseUrlDescription())
			.addText(text => text
				.setPlaceholder(this.getBaseUrlPlaceholder())
				.setValue(this.plugin.settings.baseUrl || '')
				.onChange(async value => {
					this.plugin.settings.baseUrl = value;
					await this.plugin.saveSettings();
				}));

		// CORS 说明
		if (this.plugin.settings.baseUrl && 
		    (this.plugin.settings.baseUrl.startsWith('http://192.168.') || 
		     this.plugin.settings.baseUrl.startsWith('http://10.') || 
		     this.plugin.settings.baseUrl.startsWith('http://172.16.') ||
		     this.plugin.settings.baseUrl.startsWith('http://172.17.') ||
		     this.plugin.settings.baseUrl.startsWith('http://localhost'))) {
			new Setting(containerEl)
				.setName('⚠️ 局域网 API 注意事项')
				.setDesc(
					'使用局域网 AI 网关时可能遇到 CORS 错误。<br/>请在您的 AI 网关配置中添加 CORS 允许的来源：<br/><code>Access-Control-Allow-Origin: app://obsidian.md</code><br/>或者使用支持 CORS 的代理工具。'
				)
				.setClass('cors-warning');
		}

		// 其他设置
		new Setting(containerEl)
			.setHeading()
			.setName('⚙️ 其他设置');

		new Setting(containerEl)
			.setName('自动创建附件文件夹')
			.setDesc('首次保存图片时自动创建附件文件夹')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCreateAttachments)
				.onChange(async value => {
					this.plugin.settings.autoCreateAttachments = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('图片自动重命名')
			.setDesc('上传图片时自动重命名为时间戳格式')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRenameImages)
				.onChange(async value => {
					this.plugin.settings.autoRenameImages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('记录时自动聚焦输入框')
			.setDesc('打开快速记录弹窗时自动聚焦到输入框')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoFocusInput)
				.onChange(async value => {
					this.plugin.settings.autoFocusInput = value;
					await this.plugin.saveSettings();
				}));

		// 智能整理选项
		new Setting(containerEl)
			.setHeading()
			.setName('🤖 智能整理选项');

		new Setting(containerEl)
			.setName('默认输出目录')
			.setDesc('知识卡片将保存在此目录下，按分类自动创建子目录')
			.addText(text => {
				text
					.setPlaceholder('知识体系')
					.setValue(this.plugin.settings.knowledgeBaseFolder || '知识体系')
					.onChange(async value => {
						this.plugin.settings.knowledgeBaseFolder = value;
						await this.plugin.saveSettings();
					});
			});

		// 自定义标签体系
		new Setting(containerEl)
			.setHeading()
			.setName('🏷️ 自定义标签体系');

		new Setting(containerEl)
			.setName('使用自定义分类')
			.setDesc('AI 整理时按照您定义的标签体系进行分类')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useCustomCategories)
				.onChange(async value => {
					this.plugin.settings.useCustomCategories = value;
					await this.plugin.saveSettings();
				}));

		const categoryDesc = containerEl.createDiv({ cls: 'setting-item-description' });
		categoryDesc.innerHTML = `
			<div style="margin-top: 12px; padding: 12px; background: var(--background-secondary); border-radius: 6px;">
				<strong>标签体系说明：</strong>
				<p style="margin: 8px 0; color: var(--text-muted); font-size: 13px;">
					您可以定义多级标签体系，AI 会根据碎片内容自动匹配最合适的分类。
					例如：<code>技术 → 前端开发</code>、<code>工作 → 项目管理</code>
				</p>
				<button id="edit-categories-btn" style="margin-top: 8px; padding: 6px 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;">
					✏️ 编辑标签体系
				</button>
			</div>
		`;

		// 添加编辑按钮事件
		setTimeout(() => {
			const editBtn = categoryDesc.querySelector('#edit-categories-btn');
			if (editBtn) {
				(editBtn as HTMLButtonElement).onclick = () => this.openCategoryEditor();
			}
		}, 0);
	}

	private openCategoryEditor() {
		// 创建模态框编辑标签体系
		const modal = new CategoryEditorModal(this.app, this.plugin);
		modal.open();
	}

	private getModelDescription(): string {
		switch (this.plugin.settings.aiProvider) {
			case 'openai':
				return '如 gpt-4, gpt-3.5-turbo';
			case 'ollama':
				return '如 llama2, codellama';
			case 'custom':
				return '根据您的 API 提供商填写';
			default:
				return 'AI 模型名称';
		}
	}

	private getModelPlaceholder(): string {
		switch (this.plugin.settings.aiProvider) {
			case 'openai':
				return 'gpt-4';
			case 'ollama':
				return 'llama2';
			case 'custom':
				return 'model-name';
			default:
				return 'model-name';
		}
	}

	private getBaseUrlDescription(): string {
		switch (this.plugin.settings.aiProvider) {
			case 'openai':
				return 'OpenAI API 地址，默认为 https://api.openai.com/v1/chat/completions';
			case 'ollama':
				return 'Ollama 服务器地址，默认为 http://localhost:11434';
			case 'custom':
				return '自定义 API 地址（如 http://172.17.16.34/gateway-api/v1/chat/completions）';
			default:
				return 'AI API 地址';
		}
	}

	private getBaseUrlPlaceholder(): string {
		switch (this.plugin.settings.aiProvider) {
			case 'openai':
				return 'https://api.openai.com/v1/chat/completions';
			case 'ollama':
				return 'http://localhost:11434';
			case 'custom':
				return 'http://172.17.16.34/gateway-api/v1/chat/completions';
			default:
				return 'https://api.example.com';
		}
	}
}
