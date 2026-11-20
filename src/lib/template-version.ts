/**
 * 版本号，用于给 `/template-pages/*.html`、`/template-content/*.json`、
 * 头像与模板缩略图这类「原地覆盖」发布的静态资源换缓存键。
 *
 * 线上这些路径统一返回 `Cache-Control: public, max-age=31536000, immutable`，
 * 文件名不变时浏览器与 CDN 会一直用旧内容（改头像后仍显示旧图就是这个原因）。
 * 每次覆盖这些资源都要把这个值 +1。
 */
export const TEMPLATE_ASSET_VERSION = "?v=2";
