# 头像素材来源与授权

本目录只有两张头像，均为 **AI 生成**的东亚面孔，来自 **gimgs.net**，适用
[CC0 1.0 通用（公共领域贡献）](https://creativecommons.org/publicdomain/zero/1.0/)：

- 可免费用于**商业**与个人项目，**无需署名**
- 放弃全部著作权，可任意修改、裁剪、再分发
- 非真人照片，不涉及任何人的肖像权

## 文件对照

| 文件 | 性别 | 来源页 |
|---|---|---|
| avatar-1.jpg | 女 | https://gimgs.net/ai-images/professional-japanese-woman-in-business-attire--ft3sTJUD.html |
| avatar-2.jpg | 男 | https://gimgs.net/ai-images/portrait-of-a-young-korean-man--TBq5Jt9I.html |

## 使用说明

- 仅作为简历模板的**示例头像**，不指向任何真实求职者。
- 性别与姓名的对应关系写在 `src/lib/avatar-gender.json` 与
  `src/lib/placeholder-names.json`：女性头像配「张若曦」，男性头像配「王小明」。
- 模板头像的分配由 `scripts/remap-two-avatars.mjs` 按性别写入，
  同一模板的编辑页与预览页使用同一张头像。
- 替换素材时直接覆盖同名文件即可，无需改代码；若新增头像，需同步更新
  `src/lib/avatar-gender.json`。
