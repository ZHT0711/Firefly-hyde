import type { GalleryConfig } from "@/types/galleryConfig";

// 相册配置
export const galleryConfig: GalleryConfig = {
	// 相册列表
	// 添加方法：在 public/gallery/ 下建一个目录放图片（或 urls.txt 填图片链接），
	// 再在下面添加一个相册项（id 与目录名一致）
	albums: [],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	// 值越小列数越多，值越大列数越少
	columnWidth: 240,
};
