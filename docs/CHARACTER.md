# 修改角色

游戏使用 `assets/` 中的角色图片、动画图集和植物卡片。角色数值在 `plants.js` 中，图集参数在 `assets/justin-sprites.js` 与 `assets/pingpong-sprites.js` 中。素材来源与许可见 [第三方素材说明](../THIRD_PARTY_NOTICES.md)。

## 坚果

`assets/justin-nut.png` 是保龄球使用的完整形态，`assets/packet-justin-nut.png` 是卡片。爆炸坚果使用 `assets/justin-nut-boom.png` 与对应卡片。

替换图片时同步更新图集参数中的 `w / h` 和可见区域 `crop.x / y / w / h`，并保持透明背景。卡片尺寸为 100 × 140 像素。

`plants.js` 中的 `width / height` 控制草坪上的绘制尺寸，`idleMotion` 控制待机动作，`boomnut.blastRadius` 控制爆炸范围。

## 两种向日葵

| 角色 | 普通动画 | 发光动画 | 卡片 |
| --- | --- | --- | --- |
| 景甜向日葵 | `assets/justin-sunflower-atlas.png` | `assets/justin-sunflower-glow-atlas.png` | `assets/packet-justin-sunflower.png` |
| 曾颖向日葵 | `assets/zeng-ying-sunflower-atlas.png` | `assets/zeng-ying-sunflower-glow-atlas.png` | `assets/packet-zeng-ying-sunflower.png` |

替换图集时，保持普通与发光状态的画布、角色位置和帧尺寸一致，并同步更新 `assets/justin-sprites.js` 中的帧数、列数和帧时长。

`nutflower.health`、`firstNut` 和 `nutInterval` 控制景甜向日葵的生命值与产出间隔。`zengflower.health`、`feedType` 和 `processTime` 控制曾颖向日葵的生命值、输入类型和转化时间。`nutType` 决定产出的坚果类型。

## 乒乓球僵尸

跑动、啃咬、倒下和脱落头部的图集分别为 `assets/pingpong-walk-atlas.png`、`assets/pingpong-eat-atlas.png`、`assets/pingpong-die-atlas.png`、`assets/pingpong-head-atlas.png`。对应参数在 `assets/pingpong-sprites.js` 中。

修改后运行 `npm run verify`，并手动检查卡片、携带预览、角色动画、暂停与恢复。离线版本需重新运行 `npm run build:offline`。
