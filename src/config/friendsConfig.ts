import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

// 可以在src/content/spec/friends.mdx中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "友链墙",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置（从旧博客迁移）
export const friendsConfig: FriendLink[] = [
	{
		title: "罗德岛 PRTS",
		desc: "记录泰拉大陆的各项数据与前文明遗迹，愿源石的阴霾早日散去。",
		siteurl: "https://prts.wiki/",
		imgurl: "https://bu.dusays.com/2026/03/24/69c1e38b4c370.jpg",
		tags: ["Wiki"],
		weight: 10,
		enabled: true,
	},
	{
		title: "Firefly Docs",
		desc: "Firefly主题模板文档",
		siteurl: "https://docs-firefly.cuteleaf.cn",
		imgurl: "https://docs-firefly.cuteleaf.cn/logo.png",
		tags: ["Docs"],
		weight: 10,
		enabled: true,
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
