// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
	id: number;
	content: string;
	date: string;
	images?: string[];
	video?: string;
	location?: string;
	locationUrl?: string;
	mood?: string;
	tags?: string[];
	avatar?: string;
	// 图片展示配置
	imageDisplay?: {
		type: "carousel" | "grid"; // 显示类型：轮播图或网格布局
		autoPlay?: boolean; // 是否自动播放（仅carousel模式），默认 true
		interval?: number; // 自动播放间隔（毫秒），默认 4000ms
		showIndicator?: boolean; // 是否显示位置指示器（仅carousel模式），默认 true
		showControls?: boolean; // 是否显示控制按钮（仅carousel模式），默认 true
	};
}

// 示例日记数据
const diaryData: DiaryItem[] = [];

// 获取日记列表（按时间倒序）
export const getDiaryList = (limit?: number) => {
	const sortedData = [...diaryData].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	if (limit && limit > 0) {
		return sortedData.slice(0, limit);
	}

	return sortedData;
};

// 获取所有标签
export const getAllTags = () => {
	const tags = new Set<string>();
	diaryData.forEach((item) => {
		if (item.tags) {
			item.tags.forEach((tag) => {
				tags.add(tag);
			});
		}
	});
	return Array.from(tags).sort();
};
