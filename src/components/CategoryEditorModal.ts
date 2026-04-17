import { App, Modal, Notice, Setting } from 'obsidian';
import { FragmentedKnowledgeOrgPlugin } from '../main';
import { CategoryTag, SubTag } from '../types/settings';

export class CategoryEditorModal extends Modal {
	plugin: FragmentedKnowledgeOrgPlugin;
	categories: CategoryTag[];
	editArea: HTMLTextAreaElement;

	constructor(app: App, plugin: FragmentedKnowledgeOrgPlugin) {
		super(app);
		this.plugin = plugin;
		// 深拷贝当前分类，避免直接修改
		this.categories = JSON.parse(JSON.stringify(plugin.settings.customCategories));
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: '✏️ 编辑标签体系' });

		contentEl.createDiv({ cls: 'setting-item-description' }).innerHTML = `
			<p style="color: var(--text-muted); font-size: 13px;">
				请以 JSON 格式编辑标签体系。支持一级分类和二级子标签。
			</p>
		`;

		// 显示当前配置
		this.editArea = contentEl.createEl('textarea', {
			cls: 'monaco-editor-background'
		});
		this.editArea.style.width = '100%';
		this.editArea.style.height = '400px';
		this.editArea.style.fontFamily = 'monospace';
		this.editArea.style.fontSize = '13px';
		this.editArea.style.padding = '12px';
		this.editArea.value = JSON.stringify(this.categories, null, 2);

		// 按钮
		const buttonGroup = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonGroup.style.justifyContent = 'flex-end';
		buttonGroup.style.gap = '8px';
		buttonGroup.style.marginTop = '16px';

		const cancelBtn = buttonGroup.createEl('button', {
			text: '取消',
			cls: 'modal-modify-button'
		});
		cancelBtn.style.backgroundColor = 'var(--background-modifier-border)';
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonGroup.createEl('button', {
			text: '保存',
			cls: 'mod-cta'
		});
		saveBtn.onclick = () => this.handleSave();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private handleSave() {
		try {
			const newCategories = JSON.parse(this.editArea.value);
			
			// 简单验证
			if (!Array.isArray(newCategories)) {
				throw new Error('标签体系必须是数组格式');
			}

			for (const cat of newCategories) {
				if (!cat.name) {
					throw new Error('每个分类必须有 name 字段');
				}
				if (cat.subTags && !Array.isArray(cat.subTags)) {
					throw new Error('subTags 必须是数组格式');
				}
			}

			// 保存设置
			this.plugin.settings.customCategories = newCategories;
			this.plugin.saveSettings();
			
			new Notice('✅ 标签体系保存成功');
			this.close();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : '格式错误';
			new Notice(`❌ 保存失败：${errorMsg}`);
			console.error('[标签体系] 保存错误:', error);
		}
	}
}
