import { App, TFile, TFolder } from 'obsidian';
import { PluginSettings } from '../types/settings';
import { parseFileNameTemplate, formatDate } from '../utils/dateFormatter';
import { generateImageFileName } from '../utils/markdownHelper';
import { FragmentStatus } from '../models/Fragment';

export class FileService {
	constructor(public app: App, public settings: PluginSettings) {}

	/**
	 * 获取或创建碎片文件夹
	 */
	async getFragmentFolder(): Promise<TFolder> {
		let folder = this.app.vault.getAbstractFileByPath(this.settings.fragmentFolder);

		if (!folder) {
			folder = await this.app.vault.createFolder(this.settings.fragmentFolder);
		}

		return folder as TFolder;
	}

	/**
	 * 获取指定日期的碎片文件夹（不自动创建）
	 */
	async getDateFolderIfExists(date: Date): Promise<TFolder | null> {
		const fragmentFolder = await this.getFragmentFolder();
		const dateFolderName = formatDate(date);
		const dateFolderPath = `${fragmentFolder.path}/${dateFolderName}`;

		const folder = this.app.vault.getAbstractFileByPath(dateFolderPath) as TFolder;
		return folder || null;
	}

	/**
	 * 创建指定日期的碎片文件夹
	 */
	async createDateFolder(date: Date): Promise<TFolder> {
		const fragmentFolder = await this.getFragmentFolder();
		const dateFolderName = formatDate(date);
		const dateFolderPath = `${fragmentFolder.path}/${dateFolderName}`;

		const folder = await this.app.vault.createFolder(dateFolderPath);
		return folder;
	}

	/**
	 * 获取或创建指定日期的碎片文件夹（用于创建碎片时）
	 */
	async getDateFolder(date: Date): Promise<TFolder> {
		const folder = await this.getDateFolderIfExists(date);
		if (folder) return folder;
		return await this.createDateFolder(date);
	}

	/**
	 * 获取或创建指定日期的附件文件夹（在日期目录下）
	 */
	async getAttachmentFolder(date: Date): Promise<TFolder> {
		const dateFolder = await this.getDateFolder(date);
		const attachmentPath = `${dateFolder.path}/${this.settings.attachmentFolder}`;

		let folder = this.app.vault.getAbstractFileByPath(attachmentPath) as TFolder;

		if (!folder) {
			if (this.settings.autoCreateAttachments) {
				folder = await this.app.vault.createFolder(attachmentPath);
			}
		}

		return folder;
	}

	/**
	 * 获取指定日期的碎片文件列表（每个碎片一个文件）
	 */
	async getFragmentFilesByDate(date: Date): Promise<TFile[]> {
		const dateFolder = await this.getDateFolder(date);
		const allFiles = this.app.vault.getFiles();
		
		// 筛选出该日期文件夹下的所有 markdown 文件（排除附件）
		const datePrefix = `${dateFolder.path}/`;
		const fragmentFiles = allFiles.filter(file => {
			// 排除附件文件夹
			if (file.path.startsWith(`${dateFolder.path}/${this.settings.attachmentFolder}/`)) {
				return false;
			}
			// 排除索引文件
			if (file.name.endsWith(' 知识碎片.md') || file.name === `${formatDate(date)}.md`) {
				return false;
			}
			// 属于该日期文件夹的 markdown 文件
			return file.path.startsWith(datePrefix) && file.extension === 'md';
		});

		return fragmentFiles;
	}

	/**
	 * 获取或创建指定日期的索引文件
	 */
	async getIndexFile(date: Date): Promise<TFile> {
		const dateFolder = await this.getDateFolder(date);
		const fileName = `${formatDate(date)} 知识碎片`;
		const filePath = `${dateFolder.path}/${fileName}.md`;

		let file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

		if (!file) {
			const header = `# ${formatDate(date)} ${date.toLocaleDateString('zh-CN', { weekday: 'long' })}\n\n## 碎片列表\n\n`;
			file = await this.app.vault.create(filePath, header);
		}

		return file;
	}

	/**
	 * 更新索引文件内容
	 */
	async updateIndexFile(date: Date, fragmentFiles: TFile[]): Promise<void> {
		const indexFile = await this.getIndexFile(date);
		
		const listContent = fragmentFiles
			.map(file => {
				const match = file.name.match(/(\d{2})-(\d{2})-(.+?)\.md/);
				if (match) {
					const time = `${match[1]}:${match[2]}`;
					const type = file.name.includes('文本') ? '📝' : file.name.includes('链接') ? '🔗' : '🖼️';
					return `- [[${file.name}|${time} ${type}]]`;
				}
				return `- [[${file.name}]]`;
			})
			.join('\n');

		const content = `# ${formatDate(date)} ${date.toLocaleDateString('zh-CN', { weekday: 'long' })}\n\n## 碎片列表\n\n${listContent}\n`;
		await this.app.vault.modify(indexFile, content);
	}

	/**
	 * 追加内容到文件（不再使用，保留用于兼容）
	 */
	async appendToFile(file: TFile, content: string): Promise<void> {
		const existingContent = await this.app.vault.read(file);
		const newContent = existingContent.trimEnd() + '\n\n' + content + '\n';
		await this.app.vault.modify(file, newContent);
	}

	/**
	 * 上传并保存图片
	 */
	async saveImage(imageData: ArrayBuffer, date: Date, remark?: string): Promise<string> {
		const attachmentFolder = await this.getAttachmentFolder(date);
		if (!attachmentFolder) {
			throw new Error('附件文件夹不存在');
		}

		const fileName = this.settings.autoRenameImages
			? generateImageFileName(date)
			: `image_${Date.now()}`;

		// 检测图片扩展名
		const ext = this.getImageExtension(imageData);
		const filePath = `${attachmentFolder.path}/${fileName}.${ext}`;

		const file = await this.app.vault.createBinary(filePath, imageData);
		return file.path;
	}

	/**
	 * 检测图片扩展名
	 */
	private getImageExtension(data: ArrayBuffer): string {
		const view = new DataView(data);
		const signature = view.getUint32(0);
		
		switch (signature) {
			case 0x89504E47: return 'png';
			case 0xFFD8FFE1:
			case 0xFFD8FFE0:
			case 0xFFD8FFDB: return 'jpg';
			case 0x47494638: return 'gif';
			case 0x52494646: return 'webp';
			default: return 'png';
		}
	}

	/**
	 * 更新碎片状态
	 */
	async updateFragmentStatus(fragmentFile: TFile, status: FragmentStatus): Promise<void> {
		const content = await this.app.vault.read(fragmentFile);

		// 检查 frontmatter 中是否已有 status 字段
		const hasStatusField = content.match(/^---\n[\s\S]*?status:/m);
		
		let updatedContent: string;
		if (hasStatusField) {
			// 更新现有 status
			updatedContent = content.replace(
				/(^---\n[\s\S]*?status: )\w+(?=\n)/m,
				'$1' + status
			);
		} else {
			// 添加新的 status 字段
			updatedContent = content.replace(
				/^---\n/,
				'---\nstatus: ' + status + '\n'
			);
		}

		await this.app.vault.modify(fragmentFile, updatedContent);
		console.log(`[FileService] 已更新状态：${fragmentFile.path} -> ${status}`);
	}

	/**
	 * 读取文件内容
	 */
	async readFile(file: TFile): Promise<string> {
		return await this.app.vault.read(file);
	}

	/**
	 * 创建新笔记文件
	 */
	async createNote(folder: string, fileName: string, content: string): Promise<TFile> {
		const targetFolder = this.app.vault.getAbstractFileByPath(folder) as TFolder;

		if (!targetFolder) {
			await this.app.vault.createFolder(folder);
		}

		const filePath = `${folder}/${fileName}.md`;
		return await this.app.vault.create(filePath, content);
	}
}
