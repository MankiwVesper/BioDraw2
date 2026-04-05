# BioDraw 素材规范与命名规范 v1

## 1. 文档目的

本文档用于统一 BioDraw 素材库在文件命名、分类命名、素材元数据、SVG 规范和来源记录方面的规则，为后续素材收集、入库、维护和程序读取提供统一标准。

---

## 2. 设计目标

1. 保证素材库长期可维护
2. 保证命名统一、可搜索、可程序化处理
3. 保证素材授权信息可追溯
4. 保证 SVG 素材尽量适合编辑器使用
5. 避免素材越积越乱

---

## 3. 命名总原则

1. **文件名统一用英文小写 + 下划线**
2. **显示名称可用中文**
3. **ID 与文件名尽量对应**
4. **分类命名要稳定，不频繁改动**
5. **同主题素材尽量使用统一前缀**

---

## 4. 素材文件命名规则

建议格式：

```text
<主题>_<对象>_<变体或序号>.svg
```

### 示例
- `membrane_basic_001.svg`
- `channel_protein_open_001.svg`
- `channel_protein_closed_001.svg`
- `water_molecule_001.svg`
- `glucose_001.svg`
- `vesicle_basic_001.svg`

---

## 5. 素材 ID 命名规则

素材 ID 建议与文件名保持高一致性：

```text
membrane_basic_001
channel_protein_open_001
water_molecule_001
```

### 原则
- 不要在 ID 中使用空格
- 不要使用中文 ID
- 不要使用随机无意义字符串作为主 ID

---

## 6. 分类命名规则

### 6.1 显示名称
面向用户显示时用中文，例如：
- 细胞与细胞器
- 膜与运输结构
- 分子与颗粒

### 6.2 内部分类 ID
建议用英文小写下划线，例如：
- `cells_and_organelles`
- `membrane_transport`
- `molecules_and_particles`

---

## 7. 素材元数据建议字段

每个素材建议配套记录以下信息：

```ts
type MaterialItem = {
  id: string
  name: string
  englishName?: string
  categoryId: string
  tags: string[]
  assetType: 'svg' | 'png' | 'webp'
  assetPath: string
  thumbnailPath?: string
  defaultWidth: number
  defaultHeight: number
  source?: {
    sourceName: string
    sourceUrl?: string
    license?: string
    author?: string
  }
}
```

---

## 8. SVG 素材规范建议

### 8.1 必须有 viewBox
所有 SVG 素材建议都带 `viewBox`。

### 8.2 尺寸不依赖固定 px
不要只依赖写死的 `width` / `height`，应尽量依赖 `viewBox`。

### 8.3 尽量避免复杂内嵌脚本
SVG 中不应包含：
- JavaScript
- 非必要动画脚本
- 复杂外部依赖

### 8.4 尽量避免脏元数据
导入前尽量清理：
- 编辑器私有元数据
- 冗余注释
- 无意义 group 嵌套

### 8.5 尽量保持结构可读
如有多个部件，建议合理命名分组，便于后续状态切换或局部控制。

---

## 9. 多状态素材规范

若素材存在状态变体，建议采用以下策略之一：

### 方式 A：多文件
- `channel_protein_open_001.svg`
- `channel_protein_closed_001.svg`

### 方式 B：单文件多分组
在一个 SVG 中通过分组区分：
- open
- closed

第一阶段更推荐：
- **多文件方式**
因为实现最简单、最稳。

---

## 10. 来源与授权记录规范

每个素材都建议记录：
- 来源网站
- 作者
- 授权类型
- 原始链接
- 是否经过二次修改

### 原则
没有来源和授权信息的素材，不建议直接进入正式库。

---

## 11. 缩略图规范

如素材较复杂，建议单独生成缩略图：
- 同名缩略图文件
- 尺寸统一
- 用于左侧素材面板展示

---

## 12. 第一阶段推荐主题命名示例

围绕跨膜运输主题，建议至少有如下素材命名：

- `cell_membrane_basic_001`
- `phospholipid_bilayer_basic_001`
- `channel_protein_closed_001`
- `channel_protein_open_001`
- `carrier_protein_basic_001`
- `water_molecule_001`
- `glucose_001`
- `sodium_ion_001`
- `potassium_ion_001`
- `atp_001`
- `vesicle_basic_001`
- `arrow_straight_001`
- `label_box_basic_001`

---

## 13. 入库检查建议

素材正式入库前建议检查：

1. 文件名是否符合规范
2. 是否有清晰分类
3. 是否有来源和授权记录
4. SVG 是否带 viewBox
5. 是否适合课堂风格
6. 是否需要二次重绘或风格统一
7. 是否需要状态变体支持

---

## 14. 结语

这份素材规范与命名规范的目标，是为 BioDraw 建立一套**可长期维护、可程序读取、可持续扩展**的素材库标准。

后续所有素材入库，都应尽量反复对照下面这句话：

**当前素材是否已经达到“可被稳定识别、可被稳定使用、可被长期维护”的标准？**

如果没有，就不应直接进入正式素材库。
