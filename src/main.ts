import { Plugin, WorkspaceLeaf } from 'obsidian';
import { FragmentService } from './services/FragmentService';
import { FileService } from './services/FileService';
import { AIOrganizerService } from './services/AIOrganizerService';
import { SidebarView, VIEW_TYPE_FRAGMENT_SIDEBAR } from './components/SidebarView';
import { OrganizeModal } from './components/OrganizeModal';
import { SettingsTab } from './components/SettingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './types/settings';

export class FragmentedKnowledgeOrgPlugin extends Plugin {
	settings: PluginSettings;
	fileService: FileService;
	fragmentService: FragmentService;
	aiOrganizerService: AIOrganizerService;

	async onload() {
		console.log('加载知识碎片整理插件');

		// 加载配置
		await this.loadSettings();

		// 初始化服务
		this.fileService = new FileService(this.app, this.settings);
		this.fragmentService = new FragmentService(this.fileService);
		this.aiOrganizerService = new AIOrganizerService(this.app, this.settings, this.fileService);

		// 注册侧边栏视图
		this.registerView(
			VIEW_TYPE_FRAGMENT_SIDEBAR,
			(leaf) => new SidebarView(leaf, this)
		);

		// 添加侧边栏按钮
		this.addRibbonIcon('file-text', '知识碎片', () => {
			this.activateView();
		});

		// 注册命令
		this.registerCommands();

		// 注册设置面板
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {
		console.log('卸载知识碎片整理插件');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_FRAGMENT_SIDEBAR, active: true });
			this.app.workspace.revealLeaf(leaf);
		} else {
			this.app.workspace.getLeftLeaf(true)?.setViewState({ type: VIEW_TYPE_FRAGMENT_SIDEBAR, active: true });
		}
	}

	registerCommands() {
		// 打开侧边栏
		this.addCommand({
			id: 'open-fragment-sidebar',
			name: '打开知识碎片侧边栏',
			callback: () => {
				this.activateView();
			},
		});
	}
}

export default FragmentedKnowledgeOrgPlugin;
