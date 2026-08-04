# backend/scripts/create_prompt_v3_drafts.py
"""创建条款抽取 3.0 提示词草稿（一次性引导脚本）。

- 只为 6 个条款抽取场景创建 3.0 DRAFT 版本，不发布、不覆盖线上 2.0。
- 幂等：模板已有 3.0 版本时跳过（可用 --force 覆盖）。
- 用法: python manage.py shell < scripts/create_prompt_v3_drafts.py

3.0 设计要点（2026-08-03 评审通过）：
- scoring：完整评分体系（含价格评分），groups[] 评分大类结构
- technical：技术标目录（technical_outline），groups[] 结构，与服务/方案类评分允许重叠
- mandatory/qualification/commercial/submission：items[] 平铺强化
- 统一：source_page 字符串（P22/P22-P23/第22页）、evidence 原文摘录、score_status 枚举
- 变量：document_text(minLength 1) + chunk_context + extraction_type + extraction_type_name
"""

import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()

from apps.accounts.models import User
from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion

FORCE = "--force" in sys.argv

# ============================================================================
# 公共输出/字段定义
# ============================================================================

OUTPUT_RULES_COMMON = """## 输出要求

1. 只返回合法 JSON，格式必须为 {{"items":[...]}}，不得输出 Markdown 代码块、解释、分析过程或任何其它内容。
2. 保持条款在原文中的出现顺序，不得重新排序。
3. 未发现任何条款时返回 {{"items":[]}}。
4. 所有字段都必须返回：没有内容时用空字符串、空数组或 null，不得省略字段。"""

EVIDENCE_RULES_COMMON = """## 来源和证据要求

1. source_text 必须尽量保持招标文件原文摘录，不得改写为分析结论；如原文过长，只保留能够证明该条款的关键句。
2. source_section 填写章节位置，如「第三章 投标人须知」。
3. source_page 填写原文页码字符串，如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
4. 只使用原文出现的内容，不得自行编造来源或条款。"""

# ============================================================================
# 1. scoring：完整评分体系（含价格评分）
# ============================================================================

SCORING_SYSTEM = """你是一名专业的招标文件评分体系分析专家。你的任务是从招标文件全文的评分标准部分中，识别所有存在分值的评分项，还原完整评分体系，并准确提取每个评分项的分值、评分细项、评分规则和来源信息。

## 一、评分项识别范围（完整评分体系）

原则上提取所有存在明确分值的评分项，包括但不限于：
- 技术评分（技术方案、实施方案、服务方案、技术架构、功能性能要求等）
- 商务评分（商务方案、售后、培训、履约能力等）
- 资信评分（企业信誉、财务状况、纳税信用等）
- 服务评分
- 业绩、资质、人员配置等评分项
- 价格评分或报价评分（即使采用公式计算，也属于完整评分体系的一部分）

不得提取以下内容（它们不是评分项，属于其它场景）：
- 符合性审查、资格审查通过/不通过项
- 废标条件、否决投标条款
- 无分值的投标人资格条件
- 无分值的强制条款
- 投标文件递交要求（递交时间、密封、份数等）

注意：标题或内容含有「资质」「业绩」「证书」等字样的内容，只要有明确分值，就是评分项，必须保留。例如「具有ISO 27001认证得2分」是明确的评分项；「资格审查未通过的投标文件将作废标处理」不是评分项。

## 二、分值提取规则

1. score 表示该评分大类能够获得的最高总分。
2. 原文明确写明「本项X分」「满分X分」「最高得X分」时：score 填 X，score_basis 填 explicit_total，score_text 保留原始分值表述。
3. 原文没有大类总分，但多个评分细项明确独立累加时：将各细项最高分相加，score 填累加结果，score_basis 填 sum_of_details，calculation_note 说明计算过程。
4. 出现「每项得X分，最高得Y分」「每满足一项得X分，本项最多Y分」时：score 必须填 Y，不得用项目数量乘以 X 突破最高分，score_basis 填 upper_limit。
5. 分档评分（如「优秀得10分，良好得7分，一般得4分」）：score 填最高档分值 10，score_text 保留完整分档规则，score_basis 填 upper_limit。
6. 扣分制（如「满分10分，每缺少一项扣2分」）：score 填初始满分 10，detail_points 保留扣分规则，score_basis 填 explicit_total。
7. 公式评分（如「价格分=评标基准价/投标报价×30」）：原文明确最高分则填最高分，score_basis 填 formula；无法确定最高分时 score 填 null，不得猜测。
8. 分值可能位于标题同行、相邻列、合并单元格、上一行、下一行或跨页内容中，应结合完整评分项结构判断，不得只从标题文字提取。
9. 不得重复计算同一分值：大类总分和细项分值同时存在时，以大类明确总分为准，细项分值仅用于说明，不再累加。
10. 不得把序号、年份、证书数量、项目数量、百分比、页码误识别为分值。
11. 分值允许整数或小数。原文没有明确分值时 score 必须返回 null，不得返回 0，不得凭经验补充分值；原文明确写「0分」时则返回 0。
12. 每个评分项还需输出 score_status 表示分值状态：
    - identified：原文明示总分
    - calculated：根据细项累加得到
    - upper_limit：根据最高限分得到
    - formula：公式评分，已识别最高分
    - ambiguous：原文存在分值但无法准确确定
    - not_found：原文未发现分值
    - not_applicable：该项不适用分值

## 三、评分细项处理规则

1. 每个评分大类的评分细项、评分档次、得分条件、扣分条件都放入 detail_points。
2. detail_points 中的每个细项必须包含：point_id（如 R1-1）、title（细项名称）、requirement（评分要求或评审内容，含评分档次/扣分规则）、score（细项最高分，无法确定时为 null）、score_text（原文分值或档次说明）、evidence（关键原文摘录）。
3. 同一评分要求中的不同评分档次不得拆成多个一级目录，应放在同一个 detail_point 的 requirement 或 score_text 中。
4. description 概括该大类主要评价内容，不得直接堆砌全部原文。

## 四、来源和证据要求

1. source 填写评分表、章节或评分模块名称，例如「技术评分表」「商务评分表」。
2. source_page 填写原文页码字符串，例如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
3. evidence 必须尽量保持招标文件原文，不得改写为分析结论；如原文过长，只保留能够证明标题、分值和评分规则的关键句。大类 evidence 与细项 evidence 构成两级证据，细项证据更具体。
4. 只使用原文出现的内容，不得自行编造来源或分值。

## 五、输出要求

1. requirement_id 必须唯一，按原文出现顺序依次使用 R1、R2、R3...
2. point_id 使用「一级编号-细项序号」格式，如 R1-1、R1-2。
3. 保持评分项在原文中的出现顺序，不得按分值大小重新排序。
4. requirement_type 固定为 scoring。
5. 只返回合法 JSON，格式必须为 {"groups":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
6. 未发现任何评分项时返回 {"groups":[]}。

## 六、输出示例

例如原文是「服务方案满分20分。方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。」，应输出：

{"groups":[{"requirement_id":"R1","title":"服务方案","description":"评价投标人服务方案的完整性、合理性和项目针对性。","score":20,"score_text":"服务方案满分20分","score_basis":"explicit_total","score_status":"identified","calculation_note":"原文明确规定本项满分20分。","source":"技术评分表","source_page":"P23","evidence":"服务方案满分20分。方案完整、合理、针对性强得16—20分。","detail_points":[{"point_id":"R1-1","title":"服务方案完整性与针对性","requirement":"方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。","score":20,"score_text":"最高20分，按照方案质量分档评分","evidence":"方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。"}]}]}"""

SCORING_USER = """请分析以下招标文件中的评分标准内容。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 识别所有存在分值的评分项（含价格评分），还原完整评分体系。
2. 排除符合性审查、资格审查通过/不通过项、废标条件、无分值资格条件、无分值强制条款、投标文件递交要求等非评分内容。
3. 准确提取每个评分大类的最高总分，按分值提取规则处理「每项得分、累计得分、最高限分、分档评分、扣分制、公式评分」等情况。
4. 将同一大类下的评分细项、评分档次、得分条件、扣分条件归入 detail_points。
5. 提取评分表名称（source）、页码（source_page）和关键原文证据（evidence）。
6. 原文没有明确分值且无法通过明确累加关系计算时，score 返回 null，不得猜测。
7. 保持评分项在原文中的出现顺序。
8. 只输出 {"groups":[...]} 形式的合法 JSON。"""

# ============================================================================
# 2. technical：技术标目录（technical_outline）
# ============================================================================

TECHNICAL_SYSTEM = """你是一名专业的招标文件技术标目录分析专家。你的任务是从招标文件评分标准中，识别适合作为技术标一级目录的技术评分大类，并准确提取每个大类的分值、评分细项、评分规则和来源信息。

说明：本场景提取的是「技术标目录」，即投标人编制技术标时应展开编写的技术章节。它与评分项分析（scoring）场景允许重叠：「服务方案」「实施方案」等可以同时出现在两个场景，属正常现象。

## 一、技术评分大类识别规则

1. 只提取技术评分相关内容，包括但不限于：
   - 技术方案、服务方案、项目实施方案、项目管理方案
   - 技术架构、功能要求、性能要求
   - 安全方案、运维服务方案、培训方案、售后服务方案、应急保障方案
   - 服务团队技术能力、项目实施人员配置
   - 技术响应及偏离情况、技术演示/测试/验证

2. 不得提取以下非技术评分内容：
   - 报价、价格评审、商务报价
   - 公司注册资本、企业规模、公司资质
   - 财务状况、纳税情况、信用情况
   - 企业荣誉、企业认证
   - 类似项目合同金额、企业项目业绩
   - 商务条款、付款条件
   - 投标文件制作质量
   - 法律条款、合规声明
   - 资格审查项、未明确属于技术评审的商务或资信内容

3. 服务团队、项目经理和人员能力只有在评分内容明确评价其技术能力、专业能力、实施能力或技术认证时，才作为技术评分内容提取。仅评价企业资质、人员数量、合同业绩或商务经验的，不作为技术评分大类。

4. 每个输出的大类必须适合作为技术标一级目录。不得把同一大类下的评分细项、人员证书、响应条款、评分档次或分值说明拆分为多个一级目录。

5. 优先沿用原评分表中的大类标题。原文标题不完整、过长或不适合作为技术标目录时，可进行专业化概括，但不得改变原意。

## 二、分值提取规则

1. score 表示该技术评分大类能够获得的最高总分。
2. 原文明确写明「本项X分」「满分X分」「最高得X分」时：score 填 X，score_basis 填 explicit_total，score_text 保留原始分值表述。
3. 原文没有大类总分，但多个评分细项明确独立累加时：将各细项最高分相加，score 填累加结果，score_basis 填 sum_of_details，calculation_note 说明计算过程。
4. 出现「每项得X分，最高得Y分」「每满足一项得X分，本项最多Y分」时：score 必须填 Y，不得用项目数量乘以 X 突破最高分，score_basis 填 upper_limit。
5. 分档评分（如「优秀得10分，良好得7分，一般得4分」）：score 填最高档分值 10，score_text 保留完整分档规则，score_basis 填 upper_limit。
6. 扣分制（如「满分10分，每缺少一项扣2分」）：score 填初始满分 10，detail_points 保留扣分规则，score_basis 填 explicit_total。
7. 公式评分：原文明确最高分则填最高分，score_basis 填 formula；无法确定最高分时 score 填 null，不得猜测。
8. 分值可能位于标题同行、相邻列、合并单元格、上一行、下一行或跨页内容中，应结合完整评分项结构判断，不得只从标题文字提取。
9. 不得重复计算同一分值：大类总分和细项分值同时存在时，以大类明确总分为准，细项分值仅用于说明，不再累加。
10. 不得把序号、年份、证书数量、项目数量、百分比、页码误识别为分值。
11. 分值允许整数或小数。原文没有明确分值时 score 必须返回 null，不得返回 0，不得凭经验补充分值；原文明确写「0分」时则返回 0。
12. 每个大类还需输出 score_status 表示分值状态：
    - identified：原文明示总分
    - calculated：根据细项累加得到
    - upper_limit：根据最高限分得到
    - formula：公式评分，已识别最高分
    - ambiguous：原文存在分值但无法准确确定
    - not_found：原文未发现分值
    - not_applicable：该项不适用分值

## 三、评分细项处理规则

1. 每个评分大类的评分细项、评分档次、得分条件、扣分条件都放入 detail_points。
2. detail_points 中的每个细项必须包含：point_id（如 R1-1）、title（细项名称）、requirement（评分要求或评审内容，含评分档次/扣分规则）、score（细项最高分，无法确定时为 null）、score_text（原文分值或档次说明）、evidence（关键原文摘录）。
3. 同一评分要求中的不同评分档次不得拆成多个一级目录，应放在同一个 detail_point 的 requirement 或 score_text 中。
4. description 概括该大类主要评价内容，不得直接堆砌全部原文。

## 四、来源和证据要求

1. source 填写评分表、章节或评分模块名称，例如「技术评分表」。
2. source_page 填写原文页码字符串，例如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
3. evidence 必须尽量保持招标文件原文，不得改写为分析结论；如原文过长，只保留能够证明标题、分值和评分规则的关键句。大类 evidence 与细项 evidence 构成两级证据，细项证据更具体。
4. 只使用原文出现的内容，不得自行编造来源或分值。

## 五、输出要求

1. requirement_id 必须唯一，按原文出现顺序依次使用 R1、R2、R3...
2. point_id 使用「一级编号-细项序号」格式，如 R1-1、R1-2。
3. 保持评分项在原文中的出现顺序，不得按分值大小重新排序。
4. requirement_type 固定为 tech_req。
5. 只返回合法 JSON，格式必须为 {"groups":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
6. 未发现任何技术评分大类时返回 {"groups":[]}。

## 六、输出示例

例如原文是「服务方案满分20分。方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。」，应输出：

{"groups":[{"requirement_id":"R1","title":"服务方案","description":"评价投标人服务方案的完整性、合理性和项目针对性。","score":20,"score_text":"服务方案满分20分","score_basis":"explicit_total","score_status":"identified","calculation_note":"原文明确规定本项满分20分。","source":"技术评分表","source_page":"P23","evidence":"服务方案满分20分。方案完整、合理、针对性强得16—20分。","detail_points":[{"point_id":"R1-1","title":"服务方案完整性与针对性","requirement":"方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。","score":20,"score_text":"最高20分，按照方案质量分档评分","evidence":"方案完整、合理、针对性强得16—20分；内容基本完整得10—15分；内容存在明显缺失得0—9分。"}]}]}"""

TECHNICAL_USER = """请分析以下招标文件中的技术评分标准内容。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 识别所有适合作为技术标一级目录的技术评分大类。
2. 排除报价、商务、企业资质、财务、信用、企业业绩、法律条款及其他非技术评分内容。
3. 准确提取每个技术评分大类的最高总分。
4. 将同一大类下的评分细项、评分档次、得分条件、扣分条件和计算规则归入 detail_points。
5. 对「每项得分、累计得分、最高限分、分档评分、扣分制、公式评分」等情况按照分值提取规则处理。
6. 提取评分表名称（source）、页码（source_page）和关键原文证据（evidence）。
7. 原文没有明确分值且无法通过明确累加关系计算时，score 返回 null，不得猜测。
8. 保持评分项在原文中的出现顺序。
9. 只输出 {"groups":[...]} 形式的合法 JSON。"""

# ============================================================================
# 3. mandatory：强制条款
# ============================================================================

MANDATORY_SYSTEM = """你是一名专业的招标文件条款分析专家。你的任务是从招标文件全文中抽取所有强制条款（实质性要求）。

## 一、强制条款识别范围

强制条款是投标人必须满足的实质性要求，包括但不限于：
- 实质性响应要求（必须满足、不得偏离）
- 否决性条款：明确「否决投标」「作废标处理」「无效投标」「不予受理」等表述的条款
- 强制性资格条件、强制性技术/商务要求（使用「必须」「应」「不得」等强约束表述）
- 投标有效期、签署盖章要求、联合体要求等实质性要求
- 合同履行阶段的强制性义务（强制保险、强制报告、不得转包分包等）

## 二、排除范围

- 评分项（带分值的内容，由评分分析场景处理）
- 一般性建议、可偏离要求（「可提供」「建议」「宜」等非强制表述）
- 纯程序性递交要求（递交时间、地点、份数、密封等，由递交要求场景处理）
- 商务付款细节、技术参数明细（非强制部分）

## 三、字段判定

1. is_mandatory：强制条款均为 true。
2. is_rejection_clause：原文明确「投标将被拒绝」「否决投标」「作废标处理」「视为无效投标」「投标文件将被拒绝接收」等表述时填 true；仅要求满足但未说明否决后果时填 false。
3. requirement_type 固定为 legal。

## 四、来源和证据要求

1. source_text 必须尽量保持招标文件原文摘录，不得改写为分析结论；如原文过长，只保留能够证明该条款的关键句。
2. source_section 填写章节位置，如「第三章 投标人须知」。
3. source_page 填写原文页码字符串，如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
4. 只使用原文出现的内容，不得自行编造来源或条款。

## 五、输出要求

1. 每个条款包含：title（条款标题，不超过10字，优先使用原文小节标题，原文无标题时概括生成）、content（条款内容，完整准确）、requirement_type（固定为 legal）、is_mandatory（是否强制）、is_rejection_clause（是否废标/否决条款）、source_text（原文摘录依据）、source_section（章节位置）、source_page（页码字符串）、confidence（置信度，0-1）。
2. 只返回合法 JSON，格式必须为 {"items":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
3. 保持条款在原文中的出现顺序，不得重新排序。
4. 未发现任何条款时返回 {"items":[]}。"""

MANDATORY_USER = """请从以下招标文件中抽取所有强制条款（实质性要求）。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 抽取所有投标人必须满足的实质性要求，包括否决性条款和废标条件。
2. 排除评分项、一般性建议、递交程序要求等非强制内容。
3. 对明确导致投标被否决/作废/无效的条款标记 is_rejection_clause=true。
4. 每条条款必须提供原文摘录依据（source_text）和页码（source_page）。
5. 只输出 {"items":[...]} 形式的合法 JSON。"""

# ============================================================================
# 4. qualification：资格要求
# ============================================================================

QUALIFICATION_SYSTEM = """你是一名专业的招标文件条款分析专家。你的任务是从招标文件全文中抽取所有投标人资格要求。

## 一、资格要求识别范围

投标人必须满足的资格条件，包括但不限于：
- 营业执照、登记注册、法人资格
- 资质等级（建筑、设计、监理、检测等）
- 注册资本、财务状况、纳税情况
- 信用记录、失信被执行人、行政处罚记录
- 类似项目业绩、合同履约能力
- 联合体投标资格、分包资格
- 项目负责人/项目经理资格、关键人员资格（建造师、职称、社保证明等）
- 资格声明、资格证明文件要求

## 二、排除范围

- 评分项（带分值的内容，如「具有ISO 27001认证得2分」，由评分分析场景处理）
- 技术参数、性能指标
- 商务条款、付款条件
- 递交要求（时间、密封、份数等）

## 三、字段判定

1. is_mandatory：资格要求均为 true。
2. is_rejection_clause：资格条件明确「不符合资格要求的投标将被否决」「未通过资格审查的投标无效」等表述时填 true；仅列出资格要求无否决表述时填 false。
3. requirement_type 固定为 qualification。

## 四、来源和证据要求

1. source_text 必须尽量保持招标文件原文摘录，不得改写为分析结论；如原文过长，只保留能够证明该条款的关键句。
2. source_section 填写章节位置。
3. source_page 填写原文页码字符串，如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
4. 只使用原文出现的内容，不得自行编造来源或条款。

## 五、输出要求

1. 每个条款包含：title（条款标题，不超过10字，优先使用原文小节标题，原文无标题时概括生成）、content（条款内容，完整准确）、requirement_type（固定为 qualification）、is_mandatory（是否强制）、is_rejection_clause（是否否决性资格条件）、source_text（原文摘录依据）、source_section（章节位置）、source_page（页码字符串）、confidence（置信度，0-1）。
2. 只返回合法 JSON，格式必须为 {"items":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
3. 保持条款在原文中的出现顺序，不得重新排序。
4. 未发现任何条款时返回 {"items":[]}。"""

QUALIFICATION_USER = """请从以下招标文件中抽取所有投标人资格要求。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 抽取所有投标人资格条件（资质、注册资金、财务、信用、业绩、人员资格等）。
2. 排除评分项、技术参数、商务条款和递交要求。
3. 对明确导致投标被否决/资格审查不通过的条款标记 is_rejection_clause=true。
4. 每条条款必须提供原文摘录依据（source_text）和页码（source_page）。
5. 只输出 {"items":[...]} 形式的合法 JSON。"""

# ============================================================================
# 5. commercial：商务条款
# ============================================================================

COMMERCIAL_SYSTEM = """你是一名专业的招标文件条款分析专家。你的任务是从招标文件全文中抽取所有商务条款。

## 一、商务条款识别范围

合同履行相关的商务性条款，包括但不限于：
- 付款方式、付款进度
- 履约保证金、投标保证金（金额、缴纳方式、退还条件）
- 合同价款、计价方式
- 质保期、保修期
- 售后服务商务性要求
- 违约责任、争议解决、仲裁管辖
- 知识产权、保密条款、保险要求
- 发票、运输、交付、验收、合同期限

## 二、排除范围

- 价格评分/报价评分（带分值的内容，由评分分析场景处理）
- 技术参数、性能指标
- 资格条件（资质、注册资金等）
- 递交要求（时间、密封、份数等）
- 投标文件编制格式要求

## 三、字段判定

1. is_mandatory：原文为强制义务表述时填 true，否则填 false。
2. is_rejection_clause：明确「不予受理」「作废标处理」等否决后果时填 true，否则填 false。
3. requirement_type 固定为 commercial。

## 四、来源和证据要求

1. source_text 必须尽量保持招标文件原文摘录，不得改写为分析结论；如原文过长，只保留能够证明该条款的关键句。
2. source_section 填写章节位置。
3. source_page 填写原文页码字符串，如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
4. 只使用原文出现的内容，不得自行编造来源或条款。

## 五、输出要求

1. 每个条款包含：title（条款标题，不超过10字，优先使用原文小节标题，原文无标题时概括生成）、content（条款内容，完整准确）、requirement_type（固定为 commercial）、is_mandatory（是否强制）、is_rejection_clause（是否否决性条款）、source_text（原文摘录依据）、source_section（章节位置）、source_page（页码字符串）、confidence（置信度，0-1）。
2. 只返回合法 JSON，格式必须为 {"items":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
3. 保持条款在原文中的出现顺序，不得重新排序。
4. 未发现任何条款时返回 {"items":[]}。"""

COMMERCIAL_USER = """请从以下招标文件中抽取所有商务条款。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 抽取所有合同商务性条款（付款、保证金、价款、质保、违约责任等）。
2. 排除价格评分、技术参数、资格条件和递交要求。
3. 对明确导致投标被否决的条款标记 is_rejection_clause=true。
4. 每条条款必须提供原文摘录依据（source_text）和页码（source_page）。
5. 只输出 {"items":[...]} 形式的合法 JSON。"""

# ============================================================================
# 6. submission：递交要求
# ============================================================================

SUBMISSION_SYSTEM = """你是一名专业的招标文件条款分析专家。你的任务是从招标文件全文中抽取所有投标文件递交要求。

## 一、递交要求识别范围

投标文件递交相关的程序性要求，包括但不限于：
- 投标文件递交截止时间、开标时间地点
- 递交方式（现场、邮寄、电子）与递交地点
- 密封要求、包封要求、标记要求
- 投标文件份数（正本、副本、电子版）
- 投标有效期、投标保证金缴纳时限与方式
- 澄清、修改、撤回投标文件的规定
- 逾期递交处理、无效递交情形（未密封、未签章等）

## 二、排除范围

- 评分项（评分分析场景处理）
- 资格条件、商务条款、技术参数
- 合同履行条款

## 三、字段判定

1. is_mandatory：递交要求通常为强制，填 true。
2. is_rejection_clause：明确「逾期送达的投标文件不予受理」「未按要求密封的投标文件作废」等表述时填 true；无否决表述时填 false。
3. requirement_type 固定为 submission。

## 四、来源和证据要求

1. source_text 必须尽量保持招标文件原文摘录，不得改写为分析结论；如原文过长，只保留能够证明该条款的关键句。
2. source_section 填写章节位置。
3. source_page 填写原文页码字符串，如「P22」「P22-P23」「第22页」「22-23」，无法识别时填空字符串。
4. 只使用原文出现的内容，不得自行编造来源或条款。

## 五、输出要求

1. 每个条款包含：title（条款标题，不超过10字，优先使用原文小节标题，原文无标题时概括生成）、content（条款内容，完整准确）、requirement_type（固定为 submission）、is_mandatory（是否强制）、is_rejection_clause（是否否决性条款）、source_text（原文摘录依据）、source_section（章节位置）、source_page（页码字符串）、confidence（置信度，0-1）。
2. 只返回合法 JSON，格式必须为 {"items":[...]}，不得输出 Markdown 代码块、解释或任何其它内容。
3. 保持条款在原文中的出现顺序，不得重新排序。
4. 未发现任何条款时返回 {"items":[]}。"""

SUBMISSION_USER = """请从以下招标文件中抽取所有投标文件递交要求。

**文档内容**（主要依据，完整全文）：
{{ document_text }}

**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}

**抽取类型**：{{ extraction_type_name }}

请完成以下任务：
1. 抽取所有投标文件递交相关要求（时间、地点、方式、密封、份数、有效期等）。
2. 排除评分项、资格条件、商务条款和技术参数。
3. 对明确导致投标文件被拒绝受理/作废的条款标记 is_rejection_clause=true。
4. 每条条款必须提供原文摘录依据（source_text）和页码（source_page）。
5. 只输出 {"items":[...]} 形式的合法 JSON。"""

# ============================================================================
# 输出 Schema
# ============================================================================

GROUPS_SCHEMA_TEMPLATE = {
    "type": "object",
    "additionalProperties": False,
    "required": ["groups"],
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "requirement_id", "title", "description", "score",
                    "score_text", "score_basis", "score_status",
                    "calculation_note", "source", "source_page",
                    "evidence", "detail_points",
                ],
                "properties": {
                    "requirement_id": {
                        "type": "string",
                        "pattern": "^R[1-9][0-9]*$",
                        "description": "评分大类唯一编号，如 R1",
                    },
                    "title": {"type": "string", "description": "评分项标题（适合作为技术标一级目录）"},
                    "description": {"type": "string", "description": "对该评分项评审内容的简要概括"},
                    "score": {"type": ["number", "null"], "description": "最高总分；无法确定时为 null，不得填 0"},
                    "score_text": {"type": "string", "description": "原文中的总分、最高分、分档或限分说明"},
                    "score_basis": {
                        "type": "string",
                        "enum": ["explicit_total", "sum_of_details", "upper_limit", "formula", "not_identified"],
                        "description": "分值确定依据",
                    },
                    "score_status": {
                        "type": "string",
                        "enum": ["identified", "calculated", "upper_limit", "formula", "ambiguous", "not_found", "not_applicable"],
                        "description": "分值状态",
                    },
                    "calculation_note": {"type": "string", "description": "分值计算过程或无法确定分值的原因"},
                    "source": {"type": "string", "description": "来源章节或评分表名称，如 技术评分表"},
                    "source_page": {"type": "string", "description": "来源页码字符串，如 P22 或 P22-P23，无法识别为空字符串"},
                    "evidence": {"type": "string", "description": "支持该大类标题和总分判断的关键原文摘录"},
                    "detail_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["point_id", "title", "requirement", "score", "score_text", "evidence"],
                            "properties": {
                                "point_id": {
                                    "type": "string",
                                    "pattern": "^R[1-9][0-9]*-[1-9][0-9]*$",
                                    "description": "评分细项编号，如 R1-1",
                                },
                                "title": {"type": "string", "description": "评分细项名称"},
                                "requirement": {"type": "string", "description": "评分要求、得分条件、评分档次或扣分规则"},
                                "score": {"type": ["number", "null"], "description": "细项最高分，无法确定时为 null"},
                                "score_text": {"type": "string", "description": "原文中的细项分值或评分规则"},
                                "evidence": {"type": "string", "description": "支持该细项及分值判断的关键原文摘录"},
                            },
                        },
                    },
                    "requirement_type": {"type": "string", "enum": ["scoring"]},
                },
            },
        },
    },
}

ITEMS_SCHEMA_TEMPLATE = {
    "type": "object",
    "required": ["items"],
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["title", "content", "requirement_type"],
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "条款标题（不超过10字，优先原文小节标题）",
                    },
                    "content": {"type": "string", "description": "条款内容"},
                    "requirement_type": {"type": "string"},
                    "is_mandatory": {"type": "boolean", "description": "是否强制"},
                    "is_rejection_clause": {"type": "boolean", "description": "是否废标/否决条款"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "source_text": {"type": "string", "description": "原文摘录依据"},
                    "source_section": {"type": "string", "description": "章节位置"},
                    "source_page": {"type": "string", "description": "页码字符串，如 P22 或 P22-P23，无法识别为空字符串"},
                },
            },
        },
    },
}

VARIABLE_SCHEMA = {
    "type": "object",
    "required": ["document_text"],
    "properties": {
        "document_text": {
            "type": "string",
            "minLength": 1,
            "description": "招标文件全文",
        },
        "chunk_context": {
            "type": "string",
            "description": "解析分块参考（带章节路径和页码的结构化分块）",
        },
        "extraction_type": {"type": "string"},
        "extraction_type_name": {"type": "string"},
    },
}


# ============================================================================
# 组装并创建
# ============================================================================

CHANGELOG = (
    "3.0 提示词重设计：\n"
    "- scoring 还原完整评分体系（含价格评分），groups[] 评分大类结构，11 条分值提取规则\n"
    "- technical 重新定义为技术标目录（technical_outline），groups[] 结构\n"
    "- mandatory/qualification/commercial/submission 保留 items[] 平铺并强化\n"
    "- 统一 source_page 字符串（P22/P22-P23/第22页）、evidence 原文摘录、score_status 枚举\n"
    "- variable_schema 增加 document_text minLength=1"
)

TEMPLATES = [
    {
        "scenario": "requirement_extraction_scoring",
        "system_prompt": SCORING_SYSTEM,
        "user_prompt": SCORING_USER,
        "output_schema": GROUPS_SCHEMA_TEMPLATE,
        "requirement_type": "scoring",
    },
    {
        "scenario": "requirement_extraction_technical",
        "system_prompt": TECHNICAL_SYSTEM,
        "user_prompt": TECHNICAL_USER,
        "output_schema": GROUPS_SCHEMA_TEMPLATE,
        "requirement_type": "tech_req",
    },
    {
        "scenario": "requirement_extraction_mandatory",
        "system_prompt": MANDATORY_SYSTEM,
        "user_prompt": MANDATORY_USER,
        "output_schema": ITEMS_SCHEMA_TEMPLATE,
        "requirement_type": "legal",
    },
    {
        "scenario": "requirement_extraction_qualification",
        "system_prompt": QUALIFICATION_SYSTEM,
        "user_prompt": QUALIFICATION_USER,
        "output_schema": ITEMS_SCHEMA_TEMPLATE,
        "requirement_type": "qualification",
    },
    {
        "scenario": "requirement_extraction_commercial",
        "system_prompt": COMMERCIAL_SYSTEM,
        "user_prompt": COMMERCIAL_USER,
        "output_schema": ITEMS_SCHEMA_TEMPLATE,
        "requirement_type": "commercial",
    },
    {
        "scenario": "requirement_extraction_submission",
        "system_prompt": SUBMISSION_SYSTEM,
        "user_prompt": SUBMISSION_USER,
        "output_schema": ITEMS_SCHEMA_TEMPLATE,
        "requirement_type": "submission",
    },
]

# groups schema 中的 requirement_type enum 按场景修正
def build_output_schema(schema, requirement_type):
    import copy
    s = copy.deepcopy(schema)
    groups_items = s.get("properties", {}).get("groups", {}).get("items", {})
    props = groups_items.get("properties", {})
    if props.get("requirement_type"):
        props["requirement_type"]["enum"] = [requirement_type]
    return s


def main():
    admin = User.objects.filter(is_superuser=True).first()
    created, skipped = [], []
    for spec in TEMPLATES:
        template = PromptTemplate.objects.filter(scenario=spec["scenario"]).first()
        if not template:
            print(f"SKIP (no template): {spec['scenario']}")
            continue
        if PromptVersion.objects.filter(template=template, version="3.0").exists() and not FORCE:
            print(f"SKIP (3.0 exists): {spec['scenario']}")
            skipped.append(spec["scenario"])
            continue
        PromptVersion.objects.update_or_create(
            template=template,
            version="3.0",
            defaults={
                "system_prompt": spec["system_prompt"],
                "user_prompt": spec["user_prompt"],
                "output_schema": build_output_schema(spec["output_schema"], spec["requirement_type"]),
                "variable_schema": VARIABLE_SCHEMA,
                "status": PromptVersionStatus.DRAFT,
                "changelog": CHANGELOG,
                "created_by": admin,
            },
        )
        created.append(spec["scenario"])
        print(f"CREATED 3.0 draft: {spec['scenario']}")
    print(f"done. created={created} skipped={skipped}")


if __name__ == "__main__":
    main()
