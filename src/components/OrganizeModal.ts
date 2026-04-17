import { App, Modal, Setting, Notice, ProgressBarComponent } from 'obsidian';
import moment from 'moment';
import { FragmentedKnowledgeOrgPlugin } from '../main';
import { Fragment, OrganizeOptions } from '../models/Fragment';
import { formatTime } from '../utils/dateFormatter';

export class OrganizeModal extends Modal {
	plugin: FragmentedKnowledgeOrgPlugin;
	fragments: Fragment[];
	outputFolder: string;
	autoMerge: boolean;
	autoLink: boolean;
	includeProcessed: boolean;
	dateRangeMode: 'selected' | 'today' | 'week' | 'month' | 'custom' = 'selected';
	customStartDate: moment.Moment | null = null;
	customEndDate: moment.Moment | null = null;
	fragmentCountEl: HTMLDivElement | null = null;
	fragmentListEl: HTMLDivElement | null = null;
	customDateContainer: HTMLDivElement | null = null;
	progressEl: HTMLDivElement | null = null;
	progressBarEl: HTMLProgressElement | null = null;
	statusEl: HTMLSpanElement | null = null;

	constructor(app: App, plugin: FragmentedKnowledgeOrgPlugin, fragments: Fragment[] = []) {
		super(app);
		this.plugin = plugin;
		this.fragments = fragments;
		this.outputFolder = '知识体系';
		this.autoMerge = true;
		this.autoLink = true;
		this.includeProcessed = false;
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText('🤖 AI 智能整理');

		const container = contentEl.createDiv({ cls: 'organize-modal-content' });

		// 日期范围选择
		const dateRangeSetting = new Setting(container)
			.setName('整理范围')
			.setClass('organize-setting');

		type DateRangeMode = 'selected' | 'today' | 'week' | 'month' | 'custom';
		const dateRangeOptions: { value: DateRangeMode; label: string; icon: string }[] = [
			{ value: 'selected', label: '已选碎片', icon: '☑' },
			{ value: 'today', label: '今日', icon: '📅' },
			{ value: 'week', label: '本周', icon: '📆' },
			{ value: 'month', label: '本月', icon: '🗓️' },
			{ value: 'custom', label: '自定义', icon: '📋' },
		];

		dateRangeSetting.addDropdown(dropdown => {
			dateRangeOptions.forEach(option => {
				dropdown.addOption(option.value, `${option.icon} ${option.label}`);
			});
			dropdown
				.setValue(this.dateRangeMode)
				.onChange((value: DateRangeMode) => {
					this.dateRangeMode = value;
					this.toggleCustomDateInput(value === 'custom');
					this.updateFragmentPreview();
				});
		});

		// 自定义日期范围输入
		this.customDateContainer = container.createDiv({ cls: 'custom-date-range' });
		this.customDateContainer.style.display = 'none';

		const customDateLabel = this.customDateContainer.createDiv({ cls: 'custom-date-label' });
		customDateLabel.setText('日期范围');

		const customDateInputs = this.customDateContainer.createDiv({ cls: 'custom-date-inputs' });

		// 开始日期
		const startLabel = customDateInputs.createDiv({ cls: 'date-input-label' });
		startLabel.setText('开始：');

		const startDateInput = customDateInputs.createEl('input', {
			cls: 'date-input',
			attr: { type: 'date' }
		});
		startDateInput.value = moment().subtract(7, 'days').format('YYYY-MM-DD');
		startDateInput.onchange = () => {
			const value = startDateInput.value;
			this.customStartDate = moment(value, 'YYYY-MM-DD');
			this.updateFragmentPreview();
		};

		// 结束日期
		const endLabel = customDateInputs.createDiv({ cls: 'date-input-label' });
		endLabel.setText('结束：');

		const endDateInput = customDateInputs.createEl('input', {
			cls: 'date-input',
			attr: { type: 'date' }
		});
		endDateInput.value = moment().format('YYYY-MM-DD');
		endDateInput.onchange = () => {
			const value = endDateInput.value;
			this.customEndDate = moment(value, 'YYYY-MM-DD');
			this.updateFragmentPreview();
		};

		// 已选碎片数量
		const countEl = container.createDiv({ cls: 'organize-count' });
		this.fragmentCountEl = countEl;
		this.updateFragmentCount();

		// 碎片列表预览
		const listContainer = container.createDiv({ cls: 'organize-list' });
		this.fragmentListEl = listContainer;

		// 延迟加载预览，等待用户选择日期范围
		setTimeout(() => this.updateFragmentPreview(), 100);

		// 进度条区域（初始隐藏）
		const progressContainer = container.createDiv({ cls: 'organize-progress-container is-hidden' });
		this.progressEl = progressContainer;

		const progressLabel = progressContainer.createDiv({ cls: 'organize-progress-label' });
		progressLabel.setText('准备整理...');
		this.statusEl = progressLabel;

		const progressBar = progressContainer.createEl('progress', {
			cls: 'organize-progress-bar'
		});
		this.progressBarEl = progressBar;

		// 整理选项
		new Setting(container)
			.setHeading()
			.setName('⚙️ 整理选项');

		new Setting(container)
			.setName('输出目录')
			.setDesc('知识卡片将保存在此目录下，按分类自动创建子目录')
			.addText(text => {
				text
					.setPlaceholder('知识体系')
					.setValue(this.outputFolder)
					.onChange((value: string) => {
						this.outputFolder = value;
					});
			});

		new Setting(container)
			.setName('🔄 自动合并现有卡片')
			.setDesc('如果分类下已有知识卡片，AI 会自动合并新旧内容，去重并补充')
			.addToggle(toggle => toggle
				.setValue(this.autoMerge)
				.onChange(value => {
					this.autoMerge = value;
				}));

		new Setting(container)
			.setName('🔗 自动发现关联')
			.setDesc('AI 分析知识卡片之间的关联，自动添加 [[双向链接]]')
			.addToggle(toggle => toggle
				.setValue(this.autoLink)
				.onChange(value => {
					this.autoLink = value;
				}));

		new Setting(container)
			.setName('📦 包含已整理碎片')
			.setDesc('默认只整理未整理的碎片（⏳），勾选后包含已整理的碎片（✅）')
			.addToggle(toggle => toggle
				.setValue(this.includeProcessed)
				.onChange(value => {
					this.includeProcessed = value;
					this.updateFragmentPreview();
				}));

		// 按钮
		const buttonGroup = container.createDiv({ cls: 'organize-buttons' });

		const cancelButton = buttonGroup.createEl('button', {
			text: '取消',
			cls: 'organize-btn organize-btn-cancel'
		});
		cancelButton.onclick = () => this.close();

		const startButton = buttonGroup.createEl('button', {
			text: '开始智能整理',
			cls: 'organize-btn organize-btn-start'
		});
		startButton.onclick = () => this.handleOrganize();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private toggleCustomDateInput(show: boolean) {
		if (this.customDateContainer) {
			this.customDateContainer.style.display = show ? 'block' : 'none';
		}
	}

	private updateFragmentCount() {
		const count = this.fragments.length;
		this.fragmentCountEl?.setText(`${this.dateRangeMode === 'selected' ? '已选择' : '共找到'} ${count} 条碎片`);
	}

	private async updateFragmentPreview() {
		this.fragmentListEl?.empty();

		let fragmentsToShow = this.fragments;

		// 如果不是已选模式，需要根据日期范围加载碎片
		if (this.dateRangeMode !== 'selected') {
			fragmentsToShow = await this.getFragmentsByDateRange();
		}

		// 过滤已整理的碎片（除非勾选了包含已整理碎片）
		if (!this.includeProcessed) {
			fragmentsToShow = fragmentsToShow.filter(f => f.status !== 'processed');
		}

		if (fragmentsToShow.length === 0) {
			this.fragmentListEl!.createDiv({ text: '暂无碎片', cls: 'organize-empty' });
			this.fragmentCountEl?.setText(`${this.dateRangeMode === 'selected' ? '已选择' : '共找到'} 0 条碎片`);
			return;
		}

		// 更新计数
		this.fragmentCountEl?.setText(`${this.dateRangeMode === 'selected' ? '已选择' : '共找到'} ${fragmentsToShow.length} 条碎片`);

		// 按时间倒序
		const sorted = [...fragmentsToShow].sort((a, b) => b.timestamp - a.timestamp);

		sorted.slice(0, 10).forEach(fragment => {
			const item = this.fragmentListEl!.createDiv({ cls: 'organize-list-item' });
			const time = formatTime(new Date(fragment.timestamp));
			const typeIcon = fragment.type === 'text' ? '📝' : fragment.type === 'link' ? '🔗' : '🖼️';
			const statusIcon = fragment.status === 'processed' ? '✅' : '⏳';
			item.setText(`• ${time} ${typeIcon} ${statusIcon} ${fragment.content.substring(0, 35)}...`);
		});
		if (fragmentsToShow.length > 10) {
			this.fragmentListEl!.createDiv({ text: `... 还有 ${fragmentsToShow.length - 10} 条`, cls: 'organize-more' });
		}
	}

	private async getFragmentsByDateRange(): Promise<Fragment[]> {
		const now = moment();

		let startDate: moment.Moment;
		let endDate: moment.Moment;

		switch (this.dateRangeMode) {
			case 'selected':
				return this.fragments;
			case 'today':
				startDate = now.startOf('day');
				endDate = now.endOf('day');
				break;
			case 'week':
				// 中国习惯，一周从周一开始
				const dayOfWeek = now.day();
				const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
				startDate = now.clone().subtract(daysSinceMonday, 'days').startOf('day');
				endDate = now.clone().add(6 - daysSinceMonday, 'days').endOf('day');
				break;
			case 'month':
				const year = now.year();
				const month = now.month();
				startDate = moment(`${year}-${String(month + 1).padStart(2, '0')}-01`).startOf('day');
				endDate = moment(`${year}-${String(month + 1).padStart(2, '0')}-28`).add(2, 'month').subtract(1, 'day').endOf('day');
				break;
			case 'custom':
				if (!this.customStartDate || !this.customEndDate) {
					return [];
				}
				startDate = this.customStartDate.startOf('day');
				endDate = this.customEndDate.endOf('day');
				break;
			default:
				return this.fragments;
		}

		// 从服务获取日期范围的碎片
		const allFragments: Fragment[] = [];
		const current = startDate.clone();
		let dayCount = 0;

		while (current.isSameOrBefore(endDate, 'day')) {
			const dayFragments = await this.plugin.fragmentService.getFragmentsByDate(current.toDate());
			allFragments.push(...dayFragments);
			current.add(1, 'day');
			dayCount++;
		}

		return allFragments;
	}

	private async handleOrganize() {
		// 获取要整理的碎片
		const fragmentsToOrganize = this.dateRangeMode === 'selected'
			? this.fragments
			: await this.getFragmentsByDateRange();

		if (fragmentsToOrganize.length === 0) {
			new Notice('没有需要整理的碎片', 3000);
			return;
		}

		// 显示进度条
		if (this.progressEl) {
			this.progressEl.removeClass('is-hidden');
		}
		if (this.statusEl) {
			this.statusEl.setText('准备中...');
		}
		if (this.progressBarEl) {
			this.progressBarEl.value = 0;
			this.progressBarEl.max = 100;
		}

		// 禁用按钮
		const startButton = this.contentEl.querySelector('.organize-btn-start') as HTMLButtonElement;
		startButton.disabled = true;

		try {
			const options: OrganizeOptions = {
				outputFolder: this.outputFolder,
				autoMerge: this.autoMerge,
				autoLink: this.autoLink
			};

			// 传递进度回调函数
			const createdFiles = await this.plugin.aiOrganizerService.organize(
				fragmentsToOrganize, 
				options,
				(step, message) => {
					if (this.statusEl) this.statusEl.setText(message);
					if (this.progressBarEl) this.progressBarEl.value = step;
				}
			);

			// 完成
			if (this.statusEl) this.statusEl.setText(`✅ 整理完成！创建了 ${createdFiles.length} 个知识卡片`);
			if (this.progressBarEl) this.progressBarEl.value = 100;

			new Notice(`✅ 智能整理完成！创建了 ${createdFiles.length} 个知识卡片`, 5000);
			console.log('[OrganizeModal] 创建的知识卡片:', createdFiles);

			setTimeout(() => this.close(), 1000);
		} catch (error) {
			console.error('[OrganizeModal] 整理失败:', error);
			const errorMsg = error instanceof Error ? error.message : '未知错误';
			if (this.statusEl) this.statusEl.setText(`❌ 整理失败：${errorMsg}`);
			new Notice(`❌ 整理失败：${errorMsg}`, 8000);
		} finally {
			startButton.disabled = false;
		}
	}
}
