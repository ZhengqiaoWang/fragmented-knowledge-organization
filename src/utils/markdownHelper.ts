import { Fragment } from '../models/Fragment';
import { formatTime } from './dateFormatter';

// 生成碎片文件名 (HH-MM 类型.md)
export function generateFragmentFileName(fragment: Fragment): string {
	const time = formatTime(new Date(fragment.timestamp));
	const timeParts = time.split(':');
	const hours = timeParts[0];
	const minutes = timeParts[1];
	
	const typeName = fragment.type === 'text' ? '文本' : fragment.type === 'link' ? '链接' : '图片';
	return `${hours}-${minutes}-${typeName}.md`;
}

// 将碎片转换为 Markdown 格式（独立文件，带 frontmatter）
export function fragmentToMarkdown(fragment: Fragment): string {
	const time = formatTime(new Date(fragment.timestamp));

	// Frontmatter
	const frontmatter = [
		'type: ' + fragment.type,
		'timestamp: ' + new Date(fragment.timestamp).toISOString(),
		'status: ' + (fragment.status || 'pending'),
	];

	if (fragment.metadata.imagePath) {
		frontmatter.push('imagePath: ' + fragment.metadata.imagePath);
	}
	if (fragment.metadata.remark) {
		frontmatter.push('remark: ' + fragment.metadata.remark);
	}
	if (fragment.metadata.url) {
		frontmatter.push('url: ' + fragment.metadata.url);
	}
	if (fragment.tags && fragment.tags.length > 0) {
		frontmatter.push('tags: [' + fragment.tags.map(t => `"${t}"`).join(', ') + ']');
	}

	let markdown = '---\n' + frontmatter.join('\n') + '\n---\n\n';
	markdown += `# ${time} ${fragment.type === 'text' ? '文本' : fragment.type === 'link' ? '链接' : '图片'}\n\n`;

	switch (fragment.type) {
		case 'text':
			markdown += `${fragment.content}\n`;
			break;

		case 'link':
			markdown += `${fragment.content}\n`;
			if (fragment.metadata.remark) {
				markdown += `\n- 备注：${fragment.metadata.remark}\n`;
			}
			break;

		case 'image':
			const imagePath = fragment.metadata.imagePath || '';
			markdown += `![](${imagePath})\n`;
			if (fragment.metadata.remark) {
				markdown += `\n- 备注：${fragment.metadata.remark}\n`;
			}
			break;
	}

	return markdown;
}

// 生成图片文件名
export function generateImageFileName(date: Date): string {
	const timestamp = date.toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
	return `img_${timestamp}`;
}
