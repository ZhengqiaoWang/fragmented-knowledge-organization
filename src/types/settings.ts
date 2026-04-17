// AI 提供商类型
export type AIProvider = 'openai' | 'ollama' | 'custom';

// 标签分类
export interface CategoryTag {
	name: string;					// 分类名称
	description?: string;		// 分类描述/说明
	subTags?: SubTag[];			// 子标签
}

export interface SubTag {
	name: string;					// 子标签名称
	description?: string;		// 子标签描述
}

// 插件设置
export interface PluginSettings {
	fragmentFolder: string;			// 碎片文件夹路径
	fileNameTemplate: string;		// 文件命名模板
	attachmentFolder: string;		// 附件文件夹名称
	aiProvider: AIProvider;			// AI 提供商
	apiKey: string;					// API Key
	model: string;					// 模型名称
	baseUrl?: string;				// 自定义 AI 地址
	autoCreateAttachments: boolean;	// 自动创建附件文件夹
	autoRenameImages: boolean;		// 图片自动重命名
	autoFocusInput: boolean;			// 记录时自动聚焦输入框
	knowledgeBaseFolder?: string;	// 知识卡片输出目录
	customCategories: CategoryTag[];	// 自定义分类标签体系
	useCustomCategories: boolean;		// 是否使用自定义分类
}

// 默认设置
export const DEFAULT_SETTINGS: PluginSettings = {
	fragmentFolder: '知识碎片',
	fileNameTemplate: '{日期} 知识碎片',
	attachmentFolder: '附件',
	aiProvider: 'openai',
	apiKey: '',
	model: 'gpt-4',
	baseUrl: '',
	autoCreateAttachments: true,
	autoRenameImages: true,
	autoFocusInput: true,
	knowledgeBaseFolder: '知识体系',
	customCategories: [
		{
			name: '技术',
			description: '技术相关知识',
			subTags: [
				{ name: '前端开发', description: 'HTML/CSS/JavaScript/React/Vue等' },
				{ name: '后端开发', description: 'Java/Python/Node.js/数据库等' },
				{ name: '人工智能', description: '机器学习/深度学习/大模型等' }
			]
		},
		{
			name: '工作',
			description: '工作相关内容',
			subTags: [
				{ name: '项目管理', description: '项目规划/进度跟踪/风险管理等' },
				{ name: '产品设计', description: '需求分析/原型设计/用户体验等' },
				{ name: '团队协作', description: '沟通技巧/会议记录/团队协作等' }
			]
		},
		{
			name: '生活',
			description: '生活相关记录',
			subTags: [
				{ name: '健康管理', description: '运动/饮食/睡眠等' },
				{ name: '兴趣爱好', description: '阅读/音乐/旅行等' },
				{ name: '家庭关系', description: '家人/朋友/社交等' }
			]
		}
	],
	useCustomCategories: false,
};
