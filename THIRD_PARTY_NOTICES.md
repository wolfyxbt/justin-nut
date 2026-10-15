# 第三方素材与许可

本项目为非官方同人改编。自行编写的代码和文档采用根目录的 [MIT License](LICENSE)，该许可不覆盖第三方美术、动画、音频、原作名称或人物肖像。

## 素材来源

| 内容 | 来源 | 处理方式 |
| --- | --- | --- |
| 草坪、植物、僵尸、部分界面图片、音乐与音效 | 江南游戏开发社 / JiangNanGame 的 [New-Plants-vs-Zombies-JavaScript](https://github.com/jiangnangame/New-Plants-vs-Zombies-JavaScript) | GIF 转为 PNG 动画图集，部分图片裁剪或组合 |
| 种子包底图、阳光计数框、种子栏和铲子框；传送带、红线、对话框石框与按钮、音量滑块、开场与最后一波文字图；种植、铲除、射击、命中、拾取卡片、暂停、警报等音效 | [PlantsVsZombies-decompilation](https://github.com/ruslan831/PlantsVsZombies-decompilation/tree/master/images) | 图片按界面需要组合或缩放，对话框九宫格与按钮三段拼成整图；音效由 OGG 转为单声道 MP3 |
| 孙宇晨坚果 | 项目角色设计，经 AI 图像编辑制作完整、轻度破损和重度破损形态 | 使用 Canvas / CSS 实现待机和受击效果 |
| 乒乓球僵尸的脸部参考、四肢与动作 | [PlantsVsZombies-decompilation / reanim](https://github.com/ruslan831/PlantsVsZombies-decompilation/tree/master/SexyAppFramework/reanim) 中的 `Zombie_football.reanim`、头部、头发、下颌与身体部件 | 以原版脸部特征为参考，整体生成头、颈与运动服；复用原身体动作，添加一体握拍部件 |

原始素材下载地址记录在 [`assets/sources.json`](assets/sources.json) 中。游戏原作美术和音频的权利属于相应权利人，来源仓库的许可不等于 EA / PopCap 对这些素材的独立授权。

## 上游许可

- JiangNanGame 的来源仓库使用 [长江开源协议第三版](https://github.com/jiangnangame/New-Plants-vs-Zombies-JavaScript/blob/master/LICENSE-CHINESE.md)。该协议限定非盈利使用，要求保留署名、协议与相关声明，要求二次开源沿用该协议，并禁止把作品的一部分拆出用于其他项目。协议原文保存在 [`third_party/licenses/jiangnangame/`](third_party/licenses/jiangnangame/LICENSE-CHINESE.md)。本项目的 MIT 许可不覆盖从该仓库获取的素材，也不解除这些限制。
- PlantsVsZombies-decompilation 的 [`LICENSE.txt`](https://github.com/ruslan831/PlantsVsZombies-decompilation/blob/master/LICENSE.txt) 使用 MIT 模板，但其版权年份和作者字段未填写；不能据此确认原作界面图片的再分发授权。

本项目不声明已经取得上述原作素材或人物肖像的独立再分发许可。

## 自定义角色

- 孙宇晨坚果、景甜向日葵和曾颖向日葵使用 AI 辅助编辑的角色美术及原作派生素材。本项目不声明拥有相关人物肖像的独立授权。
- 乒乓球僵尸包含原作派生素材，不包含在项目代码的 MIT 许可中。
- `assets/error.mp3` 为本项目合成的提示音。

## 开发依赖

- [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas/blob/main/LICENSE)：MIT，供自动验证使用。

该依赖不会加载到游戏页面中。
