# 交接 —— 掌中古蜀 · 三星堆

> 刷新时间：2026-09-03 凌晨（结印重做为「咒式召唤」之后）。下个会话从这里接手，先读本文，再读 `research.md`。

## 0. 三十秒版

- **是什么**：三星堆祭祀坑之谜的网页互动作品。起点是小红书「国风 vibecoding」邀约（brief 在 `docs/国风vibecoding-Brief.pdf`，**已 gitignore，不得入公开仓库**），但已定案：**不走官方认领、不做小红书小工具版，只做网页版**。
- **线上**：`https://lynlyn0215.github.io/sanxingdui-summon/`（主流程）、`/seal.html`（手势游戏）。仓库 `lynlyn0215/sanxingdui-summon`，Pages 从 main 根目录发布，push 即上线（约 1 分钟）。
- **当前主战场**：`seal.html` 的《通神·结印》，2026-09-03 重做为**火影式咒式召唤**：选一件神器 → 三个手印依次结出（每印飞回两块碎片）→ 定印按住 1.1 秒聚气 → 冲击环 + 镀金 + 金粉，神器复原。四件神器（纵目面具 / 青铜神树 / 青铜大立人 / 鸟足曲身顶尊神像）各有 3D 模型。**主流程已接入**：序章结束进 `scene-summon`，「以手结印」跳 `seal.html?from=main`，结完回 `index.html#theater` 直达假说剧场；没摄像头走旧的拖拽复原。**真手识别率仍未验证，等 Lyn 手机实测。**
- **硬约束**（Lyn 的口味，见记忆 `lyn-product-taste`）：可玩性第一；摄像头+MediaPipe 必须；手势要在手机画面内的胸前空间完成；奖励要画面不要分数；否决生辰玄学；事实与假说严格分开。

## 1. 文件地图

| 文件 | 作用 | 状态 |
|---|---|---|
| `index.html` + `main.js` | 主流程：入场门 → 考古现场序章（7 幕图片+字幕） → 3D 碎片拖拽复原 → 「研究性复原」揭示 → 四假说剧场 → 结语 | 能跑；坑位标签的真机效果未确认 |
| `restore.js` | 主流程用的 3D 拖拽拼合模块（`initRestoreScene(onDone)`） | 稳定 |
| `seal.html` + `seal.js` | **《结印》游戏**：选神器 → 摄像头 → HandLandmarker → 咒式（`RITES`：3 印 + 定印）→ 碎片飞回 → 定印聚气 → 召唤。无失败：一印卡超 12 秒可轻点跳过，以半透明推测形态补全；用时只定评级（一气呵成 / 稍有迟疑 / 结印生涩），评级只影响金光强弱。调试开关：`?nocam=1`（不开摄像头）`&auto=1`（按时间表注入合成手势）`&rite=tree` | 已重做，等真机反馈 |
| `assets/models/*.glb` | 四件神器 3D（Meshy 生成 → gltf-transform `optimize --compress quantize --texture-compress webp --texture-size 1024`，各 0.7–1.0MB）。面具原来的 6.8MB base64 `mask-glb.js` 已删 | — |
| `tools/shot.mjs` | **本机唯一可靠的视觉验证工具**：起无头 Chrome（swiftshader 跑 WebGL），走 DevTools 协议按真实时间连续截图。`node tools/shot.mjs <url> <前缀> <秒数列表> [导航后1秒执行的JS]` | — |
| `model-view.html` | 开发用：`?glb=assets/models/tree.glb` 看单个模型能否被 three-bundle 加载 | — |
| `mudra.js` | 四个手印的几何判别 + 屏幕手位圈（`zones`）。**圈的位置和判别阈值是同一份数据，改一处要同步另一处** | 合成单测 9/9 |
| `mudra-test.html` | 手印判别自检（合成关键点）。**改阈值后必须重跑，全绿才算** | — |
| `summon3d.js` | 结印的奖励层：透明 Three.js 叠在摄像头上。`init` / `load(rite)` / `landShard(i, ghost)` / `charge(k)` / `complete(rating)`。面具按 4 扇区×2 层切碎片；高瘦神器（`slice:'y'`）按 8 个水平层切，自下而上飞回像从地里长起。神树完成后九鸟分批点亮，大立人完成后手中浮现半透明"推测之物" | 稳定 |
| `lib/three-bundle.js` | Three.js r160 + GLTFLoader + OrbitControls 的单文件打包（esbuild） | — |
| `lib/mediapipe/` | tasks-vision 0.10.14 + wasm + `hand_landmarker.task`（7.5MB），本地 vendored 不依赖 CDN | — |
| `assets/hypothesis/` | 四假说动图（全部 Kling 2.6 图生视频 → 560px/12fps animated webp，人物不动只动烟/星/光）、「失火之夜」18 秒带声成片 mp4 | 2026-09-02 三张静态图已换成动图，失灵说底图重画 |
| `assets/prologue/` | 序章四张考古现场图（webp） | — |
| `research.md` | **考据底稿**：事实清单 / 假说对照 / 跨坑拼对实证 / 文案审核红线 / 来源链接 | 文案必须对照它 |
| `gesture-demo.html` `gesture-app.js` `3d-demo.html` `3d-demo.js` | 早期 demo（缘分卡版、独立 3D 拼合版），仅存档 | 可删 |
| `serve.py` / `serve-https.py` | 本地开发服务器（双栈、no-store）/ 自签 https（局域网手机测试用，**已被线上地址取代，基本不用**） | — |

## 2. 已定决策（含否决理由——别重走）

1. **只做网页版**：小红书小工具容器禁 WASM / eval / Worker / 一切网络请求 / 视频文件 / 传感器，MediaPipe 跑不了；活动上传窗口（8/15–8/20）早已过去。
2. **选三星堆**：青铜大立人本身就是"一件正在做手势的文物"，手中之物是考古未解之谜（象牙/玉琮/权杖/虚握诸说）。
3. **砍掉**：问卜/推演/缘分卡（生辰玄学，"low"）；纵目面具"认脸匹配"（57 尊人头像面容基本相同，Art Selfie 机制失效——真正的变量是发型：辫发/笄发）；「平举」手印（双臂展开超出手机画面）。
4. **叙事原则**：序章只讲确定事实（1986 砖厂发现 → 砸碎焚烧分层掩埋 → 六坑 → 跨坑碎片），"那一夜为什么"留给四假说剧场让用户站队，**不预设失火说**（曾经序章直接演大火，被判为偷偷押注单一假说，已改）。
5. **题眼**："复原是假说，成因也是假说"——鸟足神像实体无法组合，馆藏是 3D 打印的研究性复原件。结印没结满时，缺失碎片以半透明"推测形态"补全，正是呼应这一点。
6. **手印必须有出土文物为证**（环握=大立人；相向=扭头跪坐人像；顶尊=顶尊跪坐人像；独持=持龙/持鸟立人像）。**不要发明没有文物依据的手势**。
7. **视觉**：玄黑 + 古金 + 青铜绿。场景叙事走剪影纹样风（考据安全）；单体文物走博物馆写实风（AI 画得稳）。写实场景 AI 会考据穿帮（画出明清楼阁），prompt 要写死"商代木骨泥墙茅草顶夯土台，禁琉璃瓦楼阁"。
8. **环握暂不强制"右手在上"**（文物是右上左下）。Lyn 未表态，可问。
9. **结印取代主流程的拖拽复原**（2026-09-03，Lyn 拍板）：主线是摄像头结印，拖拽复原只留给没摄像头的人。
10. **咒式结构**：每件神器固定 3 个印 + 1 个定印，四件神器用现有四个手印排出四条不重复的咒式。「执璋」（二号坑执璋人像）作为第五印**未做**，因 research.md 里还没有它的考据条目，做之前先补考据。
11. **没有失败态**：奖励要画面不要分数，所以卡住可跳过、结不成也有研究性复原画面；快慢只改金光强弱。

## 3. 验证边界（诚实版）

- ✅ 合成关键点自检 9/9；四条咒式全流程（含跳过→研究性复原路径）用 `tools/shot.mjs` 无头 Chrome 截图验证过：碎片飞回、聚气环、冲击环、镀金、九鸟点亮、推测之物、finale 文案。
- ⚠️ 无头截图是 swiftshader 软渲染 + 合成手势，**不等于真机**：手机 GPU 上 MediaPipe + 四个 ~1MB glb + 粒子同跑的帧率未知。定印按 dt 累计真实时间（帧率低也按住 1.1 秒即成），但序列印要连续 4 帧命中。
- ⚠️ **真手识别率未验证**——阈值全是合成数据调的。Lyn 实测中；「顶尊」与「相向」靠高度区分最可能串。
- ⚠️ 主流程 `index.html` 的坑位标签定位只验证了公式，没看过真机效果。
- ⚠️ 性能：手机上 MediaPipe + Three.js + 摄像头同跑是否卡，未知。

## 4. 踩过的坑（本仓库相关，通用的见记忆）

- 手印阈值别猜：用 `handFeatures()` 把合成/真实关键点的 cx/cy/dx/dy 量出来再定（胸前手印质心 cy≈0.49，垂手≈0.75，"相向"上限设 0.68）。
- `mudra.js` 里 `zones` 与判别阈值必须一致，改一处同步另一处。
- 视频用作网页序章需 `-movflags +faststart`，且 python http.server 不支持 Range；现序章已改为图片，不再有此问题。
- Kling 2.6 图生视频对"statue never moves"类 prompt 响应好；ffmpeg 转 animated webp（560px/12fps/q58）≈ 1MB/5s。
- Lyn 的 Mac mini 没有摄像头，摄像头功能一律让 Lyn 用手机开线上地址测。
- AI 画三星堆场景的考据穿帮清单（都实际出现过，prompt 里要显式禁掉）：明清飞檐楼阁、青铜剑/兵器（三星堆基本不见兵器）、金条、线香、圆形金币；拓片/写实底图做图生视频时 Kling 会幻觉出真火，剪影纹样风底图则老实。旧的失灵说拓片底图就是因楼阁穿帮被换掉的。
- **内置浏览器面板一旦隐藏：rAF 不跑、WebGL 读不出画面、JS 调用会超时、面板关掉连带 preview 服务器一起死。**不要再在面板里验证结印；用 `tools/shot.mjs`（无头 Chrome）截图，本地服务器用 Bash 后台跑 `python3 serve.py 8765`。
- Chrome `--virtual-time-budget` 截图对 rAF/WebGL 页面会卡死等空闲，只能截到开局；`tools/shot.mjs` 用真实时间。
- 3D：Meshy 图生 3D 前先用 nano_banana 出「博物馆写实、纯灰背景、单件」参考图；大立人第一次手势画成 OK 手，prompt 要写死"双手各握成空心环、上下相叠"。gltf-transform optimize 后 10MB → 1MB，three r160 原生支持 KHR_mesh_quantization + EXT_texture_webp，不需要 draco 解码器。
- 生成流程：Higgsfield MCP（`balance` 查额度）→ `media_upload` 拿预签名 URL 用 curl PUT → `media_confirm` → `generate_video_batch`（kling2_6，9:16，5s，sound false，遇到 preset 推荐要带 `declined_preset_id` 重发）→ `jobs_wait` → ffmpeg `fps=12,scale=560:-2 -loop 0 -q:v 58` 转 webp。

## 5. 下一步（按优先级，等 Lyn 实测反馈后调整）

1. **按真机反馈调手印与手感**：改 `mudra.js` 阈值 + `zones`，重跑 `mudra-test.html`。咒式相关旋钮都在 `seal.js` 顶部：`HOLD_FRAMES`（序列印连续命中帧数）、`SEAL_MS`（定印按住时长）、`SKIP_AFTER_MS`（多久允许跳过）、`RATING_MS`（评级分界）。
1.5. **真机性能**：若卡，先把 `summon3d.js` 的粒子数（`addBurst` 的 n）减半、`setPixelRatio` 上限降到 1.5；再不行把 glb 用 `--simplify-ratio 0.5` 再压。
2. **结印的另外两关**（设计已定，未做；现在结印已是"选神器→咒式"，两关可作为解锁更多神器的前置）：第一关「拂土」（手部位置擦开夯土层，帧差/手位即可）；第三关「纵目」（FaceLandmarker blendshapes：瞪眼不眨，眼睛越凸越久）。分关加载，**HandLandmarker 与 FaceLandmarker 绝不同时跑**。
3. **器物匹配（非玄学版）**：按三关打法风格匹配 20 件器物（清单与判词草案在会话记忆和 research.md「奇怪的组合」段；金杖=一锤定音、铜神坛=零失误、龟背形网格状器=慢而不错、猪鼻龙=乱来但通关、虚握=中途放弃），每件配真实故事卡 + 实地验证清单（到馆钩子）。
4. 主流程与结印的关系待定：结印可能取代主流程里的"3D 拖拽复原"环节，主流程保留序章 + 假说剧场 + 结语。
5. 换修复对象为鸟足神像（讨论过未定）。（另外三个假说的动图已于 2026-09-02 补齐）
6. 删早期 demo 文件（`gesture-demo.html` `gesture-app.js` `3d-demo.html` `3d-demo.js`）。「九鸟点亮」现在是三层各三簇金粉的近似，若要真的点亮鸟，得把神树模型的鸟拆成独立 mesh。
7. AI 生成 credits 已于 2026-09-03 清零（清零前生成了三张假说动图、失灵说新底图、三件 3D 模型）。

## 6. 命令

```bash
python3 serve.py 8765                         # 本地 http://localhost:8765
open http://localhost:8765/mudra-test.html    # 改阈值后必跑
node tools/shot.mjs "http://localhost:8765/seal.html?nocam=1&auto=1&rite=tree" /tmp/tree "4,6.5,8.6,13"   # 无头截图验证结印
git push origin main                          # push 即部署，~1 分钟后线上生效
gh api repos/lynlyn0215/sanxingdui-summon/pages/builds/latest --jq .status
```
