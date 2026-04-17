import { TFile } from 'obsidian';
import { Fragment, FragmentType, FragmentStatus } from '../models/Fragment';
import { FileService } from './FileService';
import { fragmentToMarkdown, generateFragmentFileName } from '../utils/markdownHelper';

export class FragmentService {
	constructor(private fileService: FileService) {}

	/**
	 * 创建新碎片（每个碎片一个文件）
	 */
	async createFragment(
		type: FragmentType,
		content: string,
		metadata: Fragment['metadata'] = {},
		date = new Date()
	): Promise<Fragment> {
		const fragment: Fragment = {
			id: this.generateId(),
			type,
			content,
			metadata,
			timestamp: date.getTime(),
			status: 'pending',
		};

		// 保存图片类型碎片的内容处理
		if (type === 'image' && content) {
			fragment.metadata.imagePath = content;
			fragment.content = metadata.remark || '';
		}

		// 创建独立的碎片文件
		const dateFolder = await this.fileService.getDateFolder(date);
		const fileName = generateFragmentFileName(fragment);  // 已经包含 .md
		const filePath = `${dateFolder.path}/${fileName}`;

		const markdown = fragmentToMarkdown(fragment);
		await this.fileService.app.vault.create(filePath, markdown);

		// 更新索引文件
		const fragmentFiles = await this.fileService.getFragmentFilesByDate(date);
		await this.fileService.updateIndexFile(date, fragmentFiles);

		return fragment;
	}

	/**
	 * 上传图片并创建碎片
	 */
	async createImageFragment(
		imageData: ArrayBuffer,
		remark?: string,
		date = new Date()
	): Promise<Fragment> {
		const imagePath = await this.fileService.saveImage(imageData, date, remark);

		return this.createFragment('image', '', {
			imagePath,
			remark,
		}, date);
	}

	/**
	 * 获取指定日期的所有碎片（从文件列表解析）
	 */
	async getFragmentsByDate(date: Date): Promise<Fragment[]> {
		try {
			// 检查日期文件夹是否存在，不存在则直接返回空数组
			const dateFolder = await this.fileService.getDateFolderIfExists(date);
			if (!dateFolder) {
				return [];
			}
			
			const fragmentFiles = await this.fileService.getFragmentFilesByDate(date);
			const fragments: Fragment[] = [];

			for (const file of fragmentFiles) {
				const fileContent = await this.fileService.app.vault.read(file);
				const fragment = this.parseFragmentFromMarkdown(fileContent, file, date);
				if (fragment) {
					fragments.push(fragment);
				}
			}

			// 按时间倒序
			fragments.sort((a, b) => b.timestamp - a.timestamp);

			return fragments;
		} catch (error) {
			console.error('获取碎片失败:', error);
			return [];
		}
	}

	/**
	 * 从 Markdown 内容解析碎片
	 */
	private parseFragmentFromMarkdown(content: string, file: TFile, date: Date): Fragment | null {
		try {
			// 解析 frontmatter
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const metadata: Fragment['metadata'] = {};
			let status: FragmentStatus = 'pending';
			
			if (frontmatterMatch && frontmatterMatch[1]) {
				const frontmatterContent = frontmatterMatch[1];
				const lines = frontmatterContent.split('\n');
				for (const line of lines) {
					const [key, value] = line.split(':').map(s => s.trim());
					if (key === 'imagePath') {
						metadata.imagePath = value;
					} else if (key === 'remark') {
						metadata.remark = value;
					} else if (key === 'url') {
						metadata.url = value;
					} else if (key === 'status') {
						status = value as FragmentStatus;
					}
				}
			}

			// 从文件名解析时间
			const fileNameMatch = file.name.match(/(\d{2})-(\d{2})-(.+?)\.md/);
			if (!fileNameMatch || !fileNameMatch[1] || !fileNameMatch[2] || !fileNameMatch[3]) {
				return null;
			}

			const hours = parseInt(fileNameMatch[1], 10);
			const minutes = parseInt(fileNameMatch[2], 10);
			const typeName = fileNameMatch[3];
			const fragmentDate = new Date(date);
			fragmentDate.setHours(hours, minutes);

			// 解析类型
			const type: FragmentType = typeName.includes('文本') 
				? 'text' 
				: typeName.includes('链接') 
					? 'link' 
					: 'image';

			// 解析内容（frontmatter 之后的部分）
			const contentMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]+?)(?:\n\n---|$)/);
			const fragmentContent = contentMatch && contentMatch[1] ? contentMatch[1].trim() : '';

			return {
				id: this.generateId(),
				type,
				content: fragmentContent,
				metadata,
				timestamp: fragmentDate.getTime(),
				status: status,
			};
		} catch (error) {
			console.error('解析碎片失败:', error, file.path);
			return null;
		}
	}

	/**
	 * 更新碎片状态
	 */
	async updateFragmentStatus(fragmentFile: TFile, status: FragmentStatus): Promise<void> {
		const content = await this.fileService.app.vault.read(fragmentFile);
		
		// 更新 frontmatter 中的 status
		const updatedContent = content.replace(
			/(^---\n[\s\S]*?status: )\w+(?=\n)/,
			'$1' + status
		);
		
		await this.fileService.app.vault.modify(fragmentFile, updatedContent);
	}

	/**
	 * 生成唯一 ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
}
