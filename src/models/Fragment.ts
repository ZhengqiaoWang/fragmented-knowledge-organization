// 碎片类型
export type FragmentType = 'text' | 'link' | 'image';

// 碎片状态
export type FragmentStatus = 'pending' | 'processing' | 'processed';

// 碎片数据模型
export interface Fragment {
	id: string;					// UUID
	type: FragmentType;
	content: string;
	metadata: {
		url?: string;				// 链接类型
		imagePath?: string;		// 图片类型
		remark?: string;			// 备注
	};
	timestamp: number;			// 时间戳
	status: FragmentStatus;
	tags?: string[];				// 标签
}

// 知识卡片
export interface KnowledgeCard {
	category: string;			// 分类名称
	title: string;				// 卡片标题
	content: string;			// 整理后的内容
	tags: string[];				// 标签
	relatedCards: string[];		// 相关的知识卡片
	fragmentIds: string[];		// 来源碎片 ID
}

// 整理选项
export interface OrganizeOptions {
	outputFolder?: string;		// 知识卡片输出目录
	autoMerge: boolean;			// 自动合并现有卡片
	autoLink: boolean;			// 自动添加关联链接
}
