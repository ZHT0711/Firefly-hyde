/**
 * Obsidian → Firefly 博客同步脚本
 *
 * 用法：
 *   node scripts/sync-obsidian.mjs          # 只同步到本地仓库
 *   node scripts/sync-obsidian.mjs --push   # 同步后自动 git commit + push（触发线上部署）
 *
 * 规则：
 *   1. 只同步 Obsidian 库里的「博客」文件夹（见下方 SOURCE_DIR）
 *   2. 文件名以 "_" 开头的笔记会被跳过（可以用来放说明文档）
 *   3. 删掉了 Obsidian 里的笔记，对应的博客文章也会被删除
 *   4. Obsidian 的属性（properties）会自动转换成博客的 frontmatter：
 *        title/date/tags/category/description/draft/cover
 *      未写属性时，标题取文件名，日期取文件创建时间
 *   5. ![[图片.png]] 嵌入和相对路径图片会自动复制到 public/blog-images/ 并改写链接
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = "C:\\Users\\skowosy\\iCloudDrive\\iCloud~md~obsidian\\skowosy";
const SOURCE_DIR = path.join(VAULT, "博客");
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const IMAGES_DIR = path.join(ROOT, "public", "blog-images");
const MANIFEST_FILE = path.join(ROOT, "scripts", ".obsidian-sync-manifest.json");

const AUTO_PUSH = process.argv.includes("--push");

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function log(msg) {
	console.log(`[sync] ${msg}`);
}

/** 递归列出目录下所有 .md 文件（跳过 _ 开头和隐藏文件） */
function listMarkdown(dir, baseDir = dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		if (name.startsWith(".") || name.startsWith("_")) continue;
		const full = path.join(dir, name);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) {
			listMarkdown(full, baseDir, out);
		} else if (/\.(md|markdown)$/i.test(name)) {
			out.push(path.relative(baseDir, full));
		}
	}
	return out;
}

/** 解析简单的 YAML frontmatter（覆盖 Obsidian properties 的常见写法） */
function parseFrontmatter(raw) {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, body: raw };
	const data = {};
	let currentListKey = null;
	for (const line of match[1].split(/\r?\n/)) {
		const listItem = /^\s*-\s?(.*)$/.exec(line);
		if (listItem && currentListKey) {
			data[currentListKey].push(cleanScalar(listItem[1]));
			continue;
		}
		const kv = /^([A-Za-z_\-\u4e00-\u9fa5]+)\s*:\s*(.*)$/.exec(line);
		if (!kv) continue;
		const [, key, rawValue] = kv;
		currentListKey = null;
		const value = rawValue.trim();
		if (value === "") {
			// 可能是下面的列表，先占位
			data[key] = [];
			currentListKey = key;
		} else if (value.startsWith("[") && value.endsWith("]")) {
			data[key] = value
				.slice(1, -1)
				.split(",")
				.map((s) => cleanScalar(s))
				.filter(Boolean);
		} else {
			data[key] = cleanScalar(value);
		}
	}
	return { data, body: raw.slice(match[0].length) };
}

function cleanScalar(s) {
	s = s.trim();
	if (
		(s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
		(s.startsWith("'") && s.endsWith("'") && s.length > 1)
	) {
		return s.slice(1, -1);
	}
	if (s === "true") return true;
	if (s === "false") return false;
	return s;
}

function asList(v) {
	if (v == null || v === "") return [];
	if (Array.isArray(v)) return v.map(String);
	return String(v)
		.split(/[,，、]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function asBool(v) {
	return v === true || v === "true";
}

function toDate(v) {
	if (!v) return null;
	const d = new Date(String(v).replace(/\//g, "-"));
	if (Number.isNaN(d.getTime())) return null;
	return d;
}

function formatDate(d) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toYamlString(s) {
	if (/[:#\[\]{}"&*?|>%@`]/.test(s) || /\s/.test(s) || s === "") {
		return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return s;
}

/** 在整个库里按文件名找图片 */
let vaultFileIndex = null;
function findInVault(filename) {
	if (!vaultFileIndex) {
		vaultFileIndex = new Map();
		const walk = (dir) => {
			if (!fs.existsSync(dir)) return;
			let entries;
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				if (e.name.startsWith(".")) continue;
				const full = path.join(dir, e.name);
				if (e.isDirectory()) walk(full);
				else {
					const base = e.name.toLowerCase();
					if (!vaultFileIndex.has(base)) vaultFileIndex.set(base, full);
				}
			}
		};
		walk(VAULT);
	}
	return vaultFileIndex.get(filename.toLowerCase());
}

function copyImage(srcPath) {
	fs.mkdirSync(IMAGES_DIR, { recursive: true });
	const base = path.basename(srcPath);
	// 文件名加短哈希，避免不同文件夹同名图片互相覆盖
	const stamp = Buffer.from(path.relative(VAULT, srcPath).replace(/[\\/]/g, "/"))
		.toString("base64url")
		.slice(0, 8);
	const ext = path.extname(base);
	const name = `${path.basename(base, ext)}-${stamp}${ext}`;
	const dest = path.join(IMAGES_DIR, name);
	if (!fs.existsSync(dest)) fs.copyFileSync(srcPath, dest);
	return `/blog-images/${name}`;
}

/** 处理正文：转换 Obsidian 语法、搬运图片 */
function processBody(body, noteDir) {
	const copied = [];

	// 1. ![[图片.png]] / ![[图片.png|300]] 嵌入
	body = body.replace(/!\[\[([^\]|]+?)(?:\|\d+)?\]\]/g, (m, name) => {
		const found = findInVault(name.trim());
		if (!found) {
			log(`  ⚠ 找不到嵌入图片：${name.trim()}`);
			return m;
		}
		const url = copyImage(found);
		copied.push(url);
		return `![${path.basename(name).trim()}](${url})`;
	});

	// 2. 相对路径图片 ![alt](xxx.png) / ![alt](Pictures/xxx.png)
	body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, target) => {
		const t = target.trim();
		if (/^(https?:|\/\/|\/|data:|#)/i.test(t)) return m;
		const local = path.isAbsolute(t) ? t : path.resolve(noteDir, decodeURI(t));
		if (!fs.existsSync(local)) {
			log(`  ⚠ 找不到引用图片：${t}`);
			return m;
		}
		const url = copyImage(local);
		copied.push(url);
		return `![${alt}](${url})`;
	});

	// 3. 正文里的 [[笔记]] / [[笔记|别名]] 链接 → 纯文本（博客里没有双链）
	body = body.replace(/(?<!!)\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (m, name, alias) =>
		alias ? alias : name,
	);

	return { body, copied };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
	if (!fs.existsSync(SOURCE_DIR)) {
		fs.mkdirSync(SOURCE_DIR, { recursive: true });
		log(`已创建 Obsidian 博客文件夹：${SOURCE_DIR}`);
	}
	fs.mkdirSync(POSTS_DIR, { recursive: true });

	/** @type {{ posts: Record<string, {dest: string, images: string[]}> }} */
	const manifest = fs.existsSync(MANIFEST_FILE)
		? JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"))
		: { posts: {} };
	const nextManifest = { posts: {} };

	const sources = listMarkdown(SOURCE_DIR);
	let added = 0;
	let updated = 0;
	let unchanged = 0;

	for (const rel of sources) {
		const srcPath = path.join(SOURCE_DIR, rel);
		const raw = fs.readFileSync(srcPath, "utf8");
		const { data, body } = parseFrontmatter(raw);
		const stat = fs.statSync(srcPath);

		const title = String(data.title || data.标题 || path.basename(rel, path.extname(rel)));
		const publishedDate =
			toDate(data.published) ||
			toDate(data.date) ||
			toDate(data.日期) ||
			toDate(data.发布时间) ||
			stat.birthtime;
		const updatedDate = toDate(data.updated) || toDate(data.更新时间);
		const tags = asList(data.tags || data.标签);
		const category = String(data.category || data.分类 || "");
		const description = String(data.description || data.摘要 || "");
		const image = String(data.image || data.cover || data.封面 || "");
		const draft = asBool(data.draft ?? data.草稿);
		const pinned = asBool(data.pinned);
		const lang = String(data.lang || "");

		const { body: newBody, copied } = processBody(body, path.dirname(srcPath));

		let fm = "";
		fm += `title: ${toYamlString(title)}\n`;
		fm += `published: ${formatDate(publishedDate)}\n`;
		if (updatedDate) fm += `updated: ${formatDate(updatedDate)}\n`;
		fm += `description: ${toYamlString(description)}\n`;
		if (image) fm += `image: ${toYamlString(image)}\n`;
		fm += `tags: [${tags.map(toYamlString).join(", ")}]\n`;
		if (category) fm += `category: ${toYamlString(category)}\n`;
		fm += `draft: ${draft}\n`;
		if (pinned) fm += `pinned: true\n`;
		if (lang) fm += `lang: ${toYamlString(lang)}\n`;

		const dest = path.join(POSTS_DIR, rel);
		const content = `---\n${fm}---\n\n${newBody.trim()}\n`;

		const prev = manifest.posts[rel];
		const destExists = fs.existsSync(dest);
		if (destExists && prev && fs.readFileSync(dest, "utf8") === content) {
			unchanged++;
			nextManifest.posts[rel] = prev;
			continue;
		}
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, content, "utf8");
		nextManifest.posts[rel] = { dest: path.relative(ROOT, dest), images: copied };
		if (destExists) updated++;
		else added++;
		log(`${destExists ? "更新" : "新增"}：${rel}${draft ? "（草稿，不会发布）" : ""}`);
	}

	// 删除 Obsidian 里已经不存在的文章
	let deleted = 0;
	for (const [rel, info] of Object.entries(manifest.posts)) {
		if (!nextManifest.posts[rel]) {
			const abs = path.join(ROOT, info.dest || rel);
			if (fs.existsSync(abs)) {
				fs.rmSync(abs);
				deleted++;
				log(`删除：${rel}（Obsidian 里已不存在）`);
			}
		}
	}

	fs.writeFileSync(MANIFEST_FILE, JSON.stringify(nextManifest, null, 2), "utf8");
	log(`完成：新增 ${added}，更新 ${updated}，未变化 ${unchanged}，删除 ${deleted}`);

	if (AUTO_PUSH) {
		pushChanges();
	}
}

function git(args) {
	return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function pushChanges() {
	const check = git(["rev-parse", "--is-inside-work-tree"]);
	if (check.status !== 0 || check.stdout.trim() !== "true") {
		log("⚠ 不在 git 仓库里，跳过 push");
		return;
	}
	// 只 add 真实存在的路径（目录还没生成时 git add 会报错）
	// manifest 是本地状态文件，已加入 .gitignore，不参与提交
	const targets = ["src/content/posts"];
	if (fs.existsSync(path.join(ROOT, "public", "blog-images"))) {
		targets.push("public/blog-images");
	}
	git(["add", ...targets]);
	const status = git(["status", "--porcelain", ...targets]);
	if (!status.stdout.trim()) {
		log("没有需要发布的改动");
		return;
	}
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
	const commit = git(["commit", "-m", `sync: 同步 Obsidian 文章 ${stamp}`]);
	if (commit.status !== 0) {
		log(`⚠ git commit 失败：${(commit.stderr + commit.stdout).trim()}`);
		return;
	}
	const push = git(["push", "origin", "main"]);
	if (push.status !== 0) {
		log(`⚠ git push 失败（文章已提交到本地）：${(push.stderr + push.stdout).trim()}`);
		return;
	}
	log("✅ 已推送到 GitHub，线上会自动重新部署");
}

main();
