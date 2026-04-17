import { ItemView, WorkspaceLeaf, Notice, Platform } from 'obsidian';
import moment from 'moment';
import { FragmentedKnowledgeOrgPlugin } from '../main';
import { Fragment } from '../models/Fragment';
import { FragmentType } from '../models/Fragment';
import { formatTime } from '../utils/dateFormatter';

export const VIEW_TYPE_FRAGMENT_SIDEBAR = 'fragment-sidebar-view';

export class SidebarView extends ItemView {
	plugin: FragmentedKnowledgeOrgPlugin;
	currentDate: Date;
	fragments: Fragment[] = [];
	// 存储跨日选中的碎片 ID 和对应的碎片数据
	selectedFragments: Map<string, Fragment> = new Map();
	private inputEl: HTMLTextAreaElement | null = null;
	private linkInputEl: HTMLInputElement | null = null;
	private imageUploadEl: HTMLDivElement | null = null;
	private selectedImagePath: string | null = null;
	private imageRemarkInput: HTMLInputElement | null = null;
	private listContainer: HTMLDivElement | null = null;
	private dateLabel: HTMLSpanElement | null = null;
	private fragmentCountLabel: HTMLSpanElement | null = null;
	private currentInputType: FragmentType = 'text';

	constructor(leaf: WorkspaceLeaf, plugin: FragmentedKnowledgeOrgPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = new Date();
	}

	getViewType(): string {
		return VIEW_TYPE_FRAGMENT_SIDEBAR;
	}

	getDisplayText(): string {
		return '知识碎片';
	}

	getIcon(): string {
		return 'file-text';
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();

		// 标题
		const header = container.createDiv({ cls: 'fragment-sidebar-header' });
		header.createSpan({ text: '📝 知识碎片', cls: 'fragment-sidebar-title' });

		// 快速输入区域
		const inputSection = container.createDiv({ cls: 'fragment-sidebar-input-section' });

		// 类型选择器
		const typeSelector = inputSection.createDiv({ cls: 'fragment-type-selector' });
		
		const textBtn = typeSelector.createEl('button', {
			text: '📝 文本',
			cls: 'fragment-type-btn fragment-type-btn-active'
		});
		textBtn.onclick = () => this.switchInputType('text', textBtn);

		const linkBtn = typeSelector.createEl('button', {
			text: '🔗 链接',
			cls: 'fragment-type-btn'
		});
		linkBtn.onclick = () => this.switchInputType('link', linkBtn);

		const imageBtn = typeSelector.createEl('button', {
			text: '🖼️ 图片',
			cls: 'fragment-type-btn'
		});
		imageBtn.onclick = () => this.switchInputType('image', imageBtn);

		// 文本输入框
		const textInputWrapper = inputSection.createDiv({ cls: 'fragment-input-wrapper' });
		this.inputEl = textInputWrapper.createEl('textarea', {
			cls: 'fragment-input'
		});
		this.inputEl.placeholder = '输入文本内容...';
		this.inputEl.rows = 2;

		// 链接输入框（默认隐藏）
		const linkInputWrapper = inputSection.createDiv({ cls: 'fragment-input-wrapper is-hidden' });
		this.linkInputEl = linkInputWrapper.createEl('input', {
			cls: 'fragment-input fragment-input-single'
		});
		this.linkInputEl.placeholder = '输入 URL 链接...';

		// 图片上传区域（默认隐藏）
		const imageUploadWrapper = inputSection.createDiv({ cls: 'fragment-input-wrapper is-hidden' });
		this.imageUploadEl = imageUploadWrapper.createDiv({ cls: 'fragment-image-upload' });
		
		const uploadBtn = this.imageUploadEl.createEl('button', {
			text: '📁 选择图片',
			cls: 'fragment-btn fragment-btn-upload'
		});
		uploadBtn.onclick = () => this.handleImageUpload();

		const imagePathDisplay = this.imageUploadEl.createDiv({ cls: 'fragment-image-path' });
		imagePathDisplay.setText('未选择图片');

		const previewContainer = this.imageUploadEl.createDiv({ cls: 'fragment-image-preview is-hidden' });
		const previewImg = previewContainer.createEl('img', { cls: 'fragment-preview-img' });
		const previewRemove = previewContainer.createEl('button', {
			text: '✕',
			cls: 'fragment-preview-remove'
		});
		previewRemove.onclick = () => {
			this.selectedImagePath = null;
			uploadBtn.setText('📁 选择图片');
			imagePathDisplay.setText('未选择图片');
			previewContainer.addClass('is-hidden');
			if (this.imageRemarkInput) {
				this.imageRemarkInput.value = '';
			}
		};

		// 图片备注输入
		const remarkWrapper = this.imageUploadEl.createDiv({ cls: 'fragment-remark-wrapper' });
		const remarkLabel = remarkWrapper.createEl('label', { cls: 'fragment-remark-label', text: '备注 (可选):' });
		this.imageRemarkInput = remarkWrapper.createEl('input', {
			cls: 'fragment-remark-input'
		});
		this.imageRemarkInput.placeholder = '添加备注...';

		const buttonGroup = inputSection.createDiv({ cls: 'fragment-button-group' });

		const sendBtn = buttonGroup.createEl('button', {
			text: '发送',
			cls: 'fragment-btn fragment-btn-primary'
		});
		sendBtn.onclick = () => this.handleSend();

		// 今日碎片列表
		const listSection = container.createDiv({ cls: 'fragment-sidebar-list-section' });

		const listHeader = listSection.createDiv({ cls: 'fragment-list-header' });
		this.fragmentCountLabel = listHeader.createSpan({ text: `📅 今日碎片 (0)` });

		const organizeBtn = listHeader.createEl('button', {
			text: 'AI 整理',
			cls: 'fragment-btn fragment-btn-organize'
		});
		organizeBtn.onclick = () => this.handleOrganize();

		this.listContainer = listSection.createDiv({ cls: 'fragment-list-container' });

		// 日期切换器
		const dateSection = container.createDiv({ cls: 'fragment-sidebar-date-section' });

		const prevBtn = dateSection.createEl('button', { text: '◀', cls: 'fragment-date-btn' });
		prevBtn.onclick = () => this.changeDate(-1);

		this.dateLabel = dateSection.createEl('span', { cls: 'fragment-date-label' });
		this.updateDateLabel();

		const nextBtn = dateSection.createEl('button', { text: '▶', cls: 'fragment-date-btn' });
		nextBtn.onclick = () => this.changeDate(1);

		// 加载今日碎片
		await this.loadFragments();

		// 注册事件
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.loadFragments())
		);
	}

	async onClose() {
		this.fragments = [];
		this.selectedFragments.clear();
	}

	private async handleSend() {
		try {
			if (this.currentInputType === 'text') {
				const content = this.inputEl?.value?.trim();
				if (!content) {
					new Notice('请输入文本内容');
					return;
				}
				await this.plugin.fragmentService.createFragment('text', content);
				this.inputEl!.value = '';
			} else if (this.currentInputType === 'link') {
				const content = this.linkInputEl?.value?.trim();
				if (!content) {
					new Notice('请输入链接');
					return;
				}
				// 验证 URL 格式
				if (!content.match(/^https?:\/\//)) {
					new Notice('请输入有效的 URL（以 http:// 或 https:// 开头）');
					return;
				}
				await this.plugin.fragmentService.createFragment('link', content);
				this.linkInputEl!.value = '';
			} else if (this.currentInputType === 'image') {
				if (!this.selectedImagePath) {
					new Notice('请选择图片');
					return;
				}
				const remark = this.imageRemarkInput?.value?.trim();
				const metadata: Record<string, string> = {};
				if (remark) {
					metadata.remark = remark;
				}
				await this.plugin.fragmentService.createFragment('image', this.selectedImagePath, metadata);
				// 重置图片选择
				this.selectedImagePath = null;
				const uploadBtn = this.imageUploadEl?.querySelector('.fragment-btn-upload');
				const imagePathDisplay = this.imageUploadEl?.querySelector('.fragment-image-path');
				const previewContainer = this.imageUploadEl?.querySelector('.fragment-image-preview');
				const previewImg = previewContainer?.querySelector('.fragment-preview-img') as HTMLImageElement;

				uploadBtn?.setText('📁 选择图片');
				imagePathDisplay?.setText('未选择图片');
				previewContainer?.addClass('is-hidden');
				previewImg.src = '';
				if (this.imageRemarkInput) {
					this.imageRemarkInput.value = '';
				}
			}
			
			await this.loadFragments();
			new Notice('记录成功');
		} catch (error) {
			console.error('发送失败:', error);
			new Notice('记录失败，请重试');
		}
	}

	private switchInputType(type: FragmentType, btn: HTMLElement) {
		this.currentInputType = type;
		
		// 更新按钮状态
		const typeSelector = btn.parentElement;
		typeSelector?.querySelectorAll('.fragment-type-btn').forEach(b => {
			b.removeClass('fragment-type-btn-active');
		});
		btn.addClass('fragment-type-btn-active');

		// 切换输入框显示
		const wrappers = this.contentEl.querySelectorAll('.fragment-input-wrapper');
		wrappers.forEach(w => w.addClass('is-hidden'));

		if (type === 'text' && this.inputEl) {
			this.inputEl.parentElement?.removeClass('is-hidden');
			this.inputEl.focus();
		} else if (type === 'link' && this.linkInputEl) {
			this.linkInputEl.parentElement?.removeClass('is-hidden');
			this.linkInputEl.focus();
		} else if (type === 'image' && this.imageUploadEl) {
			this.imageUploadEl.parentElement?.removeClass('is-hidden');
		}
	}

	private async handleImageUpload() {
		try {
			// 移动端使用系统文件选择器
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/*';
			
			input.onchange = async () => {
				const file = input.files?.[0];
				if (!file) return;

				// 读取文件
				const arrayBuffer = await file.arrayBuffer();

				// 使用当前日期作为附件文件夹
				const currentDate = this.currentDate || new Date();
				const fileName = `${moment().format('YYYYMMDDHHmmss')}-${file.name}`;
				
				// 获取日期文件夹路径
				const dateFolder = await this.plugin.fileService.getDateFolder(currentDate);
				const attachmentFolder = `${dateFolder.path}/${this.plugin.settings.attachmentFolder}`;
				
				// 确保附件文件夹存在
				const attachmentFolderRef = this.plugin.app.vault.getAbstractFileByPath(attachmentFolder);
				if (!attachmentFolderRef) {
					await this.plugin.app.vault.createFolder(attachmentFolder);
				}
				
				const filePath = `${attachmentFolder}/${fileName}`;

				await this.plugin.app.vault.createBinary(filePath, arrayBuffer);
				this.selectedImagePath = filePath;

				// 更新 UI
				const uploadBtn = this.imageUploadEl?.querySelector('.fragment-btn-upload');
				const imagePathDisplay = this.imageUploadEl?.querySelector('.fragment-image-path');
				const previewContainer = this.imageUploadEl?.querySelector('.fragment-image-preview');
				const previewImg = previewContainer?.querySelector('.fragment-preview-img') as HTMLImageElement;

				uploadBtn?.setText('✅ 已选择');
				imagePathDisplay?.setText(fileName);
				previewContainer?.removeClass('is-hidden');
				
				// 读取图片为 Data URL 用于预览
				const blob = new Blob([arrayBuffer]);
				const url = URL.createObjectURL(blob);
				previewImg.src = url;

				new Notice('图片上传成功');
			};

			input.click();
		} catch (error) {
			console.error('图片上传失败:', error);
			new Notice('图片上传失败');
		}
	}

	private async handleOrganize() {
		const { OrganizeModal } = await import('./OrganizeModal');

		if (this.selectedFragments.size === 0) {
			// 如果没有选择碎片，打开弹窗让用户选择日期范围
			new OrganizeModal(this.app, this.plugin, []).open();
		} else {
			// 如果选择了碎片，传递选中的碎片数组
			const selectedFragmentsArray = Array.from(this.selectedFragments.values());
			new OrganizeModal(this.app, this.plugin, selectedFragmentsArray).open();
		}
	}

	private async loadFragments() {
		try {
			// 检查日期文件夹是否存在
			const dateFolder = await this.plugin.fileService.getDateFolderIfExists(this.currentDate);
			if (!dateFolder) {
				// 文件夹不存在，清空碎片列表
				this.fragments = [];
				this.renderList();
				this.updateFragmentCount();
				return;
			}
			
			this.fragments = await this.plugin.fragmentService.getFragmentsByDate(this.currentDate);
			this.renderList();
			this.updateFragmentCount();
		} catch (error) {
			console.error('加载碎片失败:', error);
		}
	}

	private updateFragmentCount() {
		this.fragmentCountLabel?.setText(`📅 今日碎片 (${this.fragments.length})`);
	}

	private renderList() {
		this.listContainer?.empty();

		if (this.fragments.length === 0) {
			this.listContainer!.createDiv({ text: '暂无碎片', cls: 'fragment-empty' });
			return;
		}

		// 按时间倒序
		this.fragments.sort((a, b) => b.timestamp - a.timestamp);

		this.fragments.forEach(fragment => {
			const item = this.listContainer!.createDiv({
				cls: 'fragment-list-item',
				attr: { 'data-id': fragment.id }
			});

			if (this.selectedFragments.has(fragment.id)) {
				item.addClass('fragment-list-item-selected');
			}

			item.onclick = () => this.toggleSelect(fragment.id, item, fragment);

			const checkbox = item.createDiv({ cls: 'fragment-checkbox' });
			checkbox.setText(this.selectedFragments.has(fragment.id) ? '☑' : '☐');

			const content = item.createDiv({ cls: 'fragment-content' });
			const time = formatTime(new Date(fragment.timestamp));

			const typeIcon = fragment.type === 'text' ? '📝' : fragment.type === 'link' ? '🔗' : '🖼️';
			const statusIcon = fragment.status === 'processed' ? '✅' : '⏳';
			content.setText(`${time} ${typeIcon} ${statusIcon} ${fragment.content.substring(0, 25)}...`);
		});
	}

	private toggleSelect(id: string, element: HTMLElement, fragment: Fragment) {
		if (this.selectedFragments.has(id)) {
			this.selectedFragments.delete(id);
			element.removeClass('fragment-list-item-selected');
		} else {
			this.selectedFragments.set(id, fragment);
			element.addClass('fragment-list-item-selected');
		}
		this.renderList();
	}

	private changeDate(days: number) {
		this.currentDate = new Date(this.currentDate);
		this.currentDate.setDate(this.currentDate.getDate() + days);
		this.updateDateLabel();
		this.loadFragments();
	}

	private updateDateLabel() {
		this.dateLabel?.setText(this.currentDate.toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}));
	}
}
