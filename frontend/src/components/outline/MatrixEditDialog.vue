<!-- frontend/src/components/outline/MatrixEditDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    width="980px"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="matrix-edit-dialog"
  >
    <template #header>
      <div class="dialog-header">
        <div>
          <h2>编辑内容责任矩阵</h2>
          <p>为当前章节定义写作边界、依赖关系与生成优先级</p>
        </div>
      </div>
    </template>

    <div class="dialog-body">
      <!-- 章节信息条 -->
      <div class="chapter-bar">
        <span class="chapter-label">章节：</span>
        <strong>{{ sectionNumber }} {{ section?.title }}</strong>

        <el-tag
          size="small"
          type="success"
          effect="light"
          class="ml-12"
        >
          {{ matrixStatusText }}
        </el-tag>

        <el-tag
          size="small"
          type="primary"
          effect="plain"
          class="ml-8"
        >
          版本 v{{ contentMatrixVersion }}
        </el-tag>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="matrix-form"
      >
        <!-- 1 基础设置 -->
        <section class="matrix-section">
          <div class="section-title">
            <div>
              <span class="step-dot">1</span>
              <span class="title-text">基础设置</span>
              <span class="title-desc">定义本章节的定位与表达方式</span>
            </div>
          </div>

          <el-row :gutter="24">
            <el-col :span="8">
              <el-form-item label="章节定位" prop="section_role">
                <el-select v-model="form.section_role" class="w-full">
                  <el-option
                    v-for="item in sectionRoleOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="8">
              <el-form-item label="表达形式" prop="expression_form">
                <el-select v-model="form.expression_form" class="w-full">
                  <el-option
                    v-for="item in expressionFormOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="8">
              <el-form-item label="写作深度" prop="writing_depth">
                <el-select v-model="form.writing_depth" class="w-full">
                  <el-option
                    v-for="item in writingDepthOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item class="priority-form-item">
            <template #label>
              <span>生成优先级</span>
              <el-tooltip
                content="数值越大，正文章节生成越靠前"
                placement="top"
              >
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>

            <div class="priority-control">
              <div class="priority-main">
                <el-slider
                  v-model="form.generation_priority"
                  :min="0"
                  :max="100"
                  :step="5"
                  :marks="priorityMarks"
                  class="priority-slider"
                />

                <el-input-number
                  v-model="form.generation_priority"
                  :min="0"
                  :max="100"
                  :step="5"
                  controls-position="right"
                  class="priority-input"
                />
              </div>

              <div class="priority-tip">
                数值越大，正文章节生成越靠前；叶子章节建议 80-100，父章节建议 20-40。
              </div>
            </div>
          </el-form-item>
        </section>

        <!-- 2 写作边界 -->
        <section class="matrix-section">
          <div class="section-title">
            <div>
              <span class="step-dot">2</span>
              <span class="title-text">写作边界</span>
              <span class="title-desc">明确本章的写作范围与排除内容</span>
            </div>
          </div>

          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="本章写什么" prop="write_scope">
                <el-input
                  v-model="form.write_scope"
                  type="textarea"
                  :rows="4"
                  maxlength="500"
                  show-word-limit
                  placeholder="说明本章负责展开的内容范围"
                />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="本章不写什么" prop="exclude_scope">
                <el-input
                  v-model="form.exclude_scope"
                  type="textarea"
                  :rows="4"
                  maxlength="500"
                  show-word-limit
                  placeholder="说明本章禁止展开或需要避免重复的内容"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </section>

        <!-- 3 章节关系 -->
        <section class="matrix-section">
          <div class="section-title">
            <div>
              <span class="step-dot">3</span>
              <span class="title-text">章节关系</span>
              <span class="title-desc">管理引用、依赖与禁止重复的章节</span>
            </div>
          </div>

          <el-form-item class="relation-form-item">
            <template #label>
              <span>可引用章节</span>
              <el-tooltip
                content="本章可以简要引用这些章节，但不建议大段复制"
                placement="top"
              >
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>

            <el-select
              v-model="form.reference_section_ids"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="请选择可引用的章节"
              class="w-full"
            >
              <el-option
                v-for="item in filteredSectionOptions"
                :key="item.id"
                :label="`${item.section_number} ${item.title}`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item class="relation-form-item">
            <template #label>
              <span>禁止重复章节</span>
              <el-tooltip
                content="这些章节的核心内容本章只能引用，不得展开"
                placement="top"
              >
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>

            <el-select
              v-model="form.no_duplicate_section_ids"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="请选择禁止重复的章节"
              class="w-full"
            >
              <el-option
                v-for="item in filteredSectionOptions"
                :key="item.id"
                :label="`${item.section_number} ${item.title}`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item class="relation-form-item">
            <template #label>
              <span>依赖章节</span>
              <el-tooltip
                content="依赖章节必须先完成，当前章节再生成"
                placement="top"
              >
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>

            <el-select
              v-model="form.dependency_section_ids"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="请选择依赖的章节"
              class="w-full"
            >
              <el-option
                v-for="item in filteredSectionOptions"
                :key="item.id"
                :label="`${item.section_number} ${item.title}`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
        </section>

        <!-- 4 备注说明 -->
        <section class="matrix-section">
          <div class="section-title">
            <div>
              <span class="step-dot">4</span>
              <span class="title-text">备注说明</span>
              <span class="title-desc">AI 建议与人工补充说明</span>
            </div>
          </div>

          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="AI 划分说明">
                <el-input
                  v-model="form.ai_reasoning_summary"
                  type="textarea"
                  :rows="4"
                  disabled
                  placeholder="AI 生成的边界划分依据"
                />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="人工备注">
                <el-input
                  v-model="form.manual_notes"
                  type="textarea"
                  :rows="4"
                  maxlength="500"
                  show-word-limit
                  placeholder="补充自定义要求（高优先级）"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </section>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-button @click="visible = false">
            取消
          </el-button>
        </div>

        <el-button
          type="primary"
          :loading="saving"
          @click="handleSave"
        >
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { getSectionMatrix, updateSectionMatrix, type ContentMatrix, type SectionMatrix } from '@/api/outline'

interface SectionOption {
  id: number
  section_number: string
  title: string
}

interface SectionInfo {
  id: number
  section_number?: string
  title: string
}

const props = defineProps<{
  sectionId: number
  section?: SectionInfo
  allSections: SectionOption[]
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const visible = defineModel<boolean>('visible')
const saving = ref(false)
const contentMatrixVersion = ref(1)
const contentMatrixStatus = ref('pending')
const sectionNumber = ref('')

const formRef = ref<FormInstance>()

const sectionRoleOptions = [
  { label: '资格证明', value: 'qualification' },
  { label: '技术方案', value: 'technical_solution' },
  { label: '商务响应', value: 'business_response' },
  { label: '服务方案', value: 'service_plan' },
  { label: '团队介绍', value: 'team_intro' },
  { label: '附件材料', value: 'attachment' },
  { label: '其他', value: 'other' },
]

const expressionFormOptions = [
  { label: '正文', value: 'body_text' },
  { label: '表格', value: 'table' },
  { label: '承诺函', value: 'commitment_letter' },
  { label: '证明材料', value: 'certificate' },
  { label: '附件索引', value: 'attachment_index' },
  { label: '简历表', value: 'resume_table' },
  { label: '混合形式', value: 'mixed' },
]

const writingDepthOptions = [
  { label: '概述', value: 'overview' },
  { label: '适度展开', value: 'moderate' },
  { label: '详细展开', value: 'detailed' },
]

const priorityMarks = {
  0: '最后',
  20: '父章节',
  50: '普通',
  80: '优先',
  100: '最优先',
}

const form = reactive({
  section_role: 'other',
  write_scope: '',
  exclude_scope: '',
  expression_form: 'body_text',
  writing_depth: 'moderate',
  generation_priority: 50,
  ai_reasoning_summary: '',
  manual_notes: '',
  reference_section_ids: [] as number[],
  no_duplicate_section_ids: [] as number[],
  dependency_section_ids: [] as number[],
})

const rules: FormRules = {
  section_role: [
    { required: true, message: '请选择章节定位', trigger: 'change' },
  ],
  expression_form: [
    { required: true, message: '请选择表达形式', trigger: 'change' },
  ],
  writing_depth: [
    { required: true, message: '请选择写作深度', trigger: 'change' },
  ],
  write_scope: [
    { required: true, message: '请填写本章写什么', trigger: 'blur' },
    { min: 10, message: '写作范围描述至少 10 个字符', trigger: 'blur' },
  ],
}

const filteredSectionOptions = computed(() => {
  return props.allSections.filter(item => item.id !== props.sectionId)
})

const matrixStatusText = computed(() => {
  const map: Record<string, string> = {
    pending: '待生成',
    generating: '生成中',
    generated: '已生成',
    edited: '已编辑',
    failed: '生成失败',
  }
  return map[contentMatrixStatus.value] || contentMatrixStatus.value || '-'
})

async function loadMatrix() {
  try {
    const res = await getSectionMatrix(props.sectionId)
    const data = res.data as SectionMatrix

    contentMatrixVersion.value = data.content_matrix_version
    contentMatrixStatus.value = data.content_matrix_status
    sectionNumber.value = ''

    if (data.content_matrix) {
      form.section_role = data.content_matrix.section_role || 'other'
      form.write_scope = data.content_matrix.write_scope || ''
      form.exclude_scope = data.content_matrix.exclude_scope || ''
      form.expression_form = data.content_matrix.expression_form || 'body_text'
      form.writing_depth = data.content_matrix.writing_depth || 'moderate'
      form.generation_priority = Number(data.content_matrix.generation_priority ?? 50)
      form.ai_reasoning_summary = data.content_matrix.ai_reasoning_summary || ''
      form.manual_notes = data.content_matrix.manual_notes || ''

      form.reference_section_ids = toIdList(data.content_matrix.reference_sections)
      form.no_duplicate_section_ids = toIdList(data.content_matrix.no_duplicate_sections)
      form.dependency_section_ids = toIdList(data.content_matrix.dependency_sections)
    }
  } catch (err) {
    console.error('加载矩阵失败:', err)
    ElMessage.error('加载矩阵失败')
  }
}

function toIdList(list?: Array<{ id: number }>) {
  if (!Array.isArray(list)) return []
  return list.map(item => item.id).filter(Boolean)
}

function idsToSectionRefs(ids: number[]) {
  return ids
    .map(id => props.allSections.find(item => item.id === id))
    .filter(Boolean)
    .map(item => ({
      id: item!.id,
      section_number: item!.section_number,
      title: item!.title,
    }))
}

function buildContentMatrix(): ContentMatrix {
  return {
    section_role: form.section_role,
    write_scope: form.write_scope,
    exclude_scope: form.exclude_scope,
    expression_form: form.expression_form,
    writing_depth: form.writing_depth,
    generation_priority: form.generation_priority,
    ai_reasoning_summary: form.ai_reasoning_summary,
    manual_notes: form.manual_notes,
    reference_sections: idsToSectionRefs(form.reference_section_ids),
    no_duplicate_sections: idsToSectionRefs(form.no_duplicate_section_ids),
    dependency_sections: idsToSectionRefs(form.dependency_section_ids),
    related_requirements: [],
  }
}

async function handleSave() {
  await formRef.value?.validate()

  saving.value = true

  try {
    const payload = {
      content_matrix_version: contentMatrixVersion.value,
      content_matrix: buildContentMatrix(),
    }

    const res = await updateSectionMatrix(props.sectionId, payload)
    const result = res.data as any

    if (result.success) {
      ElMessage.success('内容责任矩阵已保存')
      visible.value = false
      emit('saved')
    } else if (result.error_code === 'VERSION_CONFLICT') {
      await ElMessageBox.alert(
        '矩阵内容已被其他操作更新，请刷新后再编辑。',
        '版本冲突',
        {
          type: 'warning',
          confirmButtonText: '我知道了',
        },
      )
      emit('saved')
    }
  } catch (error: any) {
    const errorCode = error?.response?.data?.error_code

    if (errorCode === 'VERSION_CONFLICT') {
      await ElMessageBox.alert(
        '矩阵内容已被其他操作更新，请刷新后再编辑。',
        '版本冲突',
        {
          type: 'warning',
          confirmButtonText: '我知道了',
        },
      )
      emit('saved')
      return
    }

    ElMessage.error(error?.response?.data?.message || '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

watch(visible, (val) => {
  if (val) {
    loadMatrix()
  }
})
</script>

<style scoped>
.dialog-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 700;
  line-height: 28px;
}

.dialog-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 14px;
}

.dialog-body {
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.chapter-bar {
  display: flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 16px;
  padding: 0 16px;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
  color: #1f2937;
  font-size: 14px;
}

.chapter-label {
  color: #475467;
}

.ml-8 {
  margin-left: 8px;
}

.ml-12 {
  margin-left: 12px;
}

.matrix-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.matrix-section {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.title-text {
  color: #111827;
  font-size: 15px;
  font-weight: 600;
}

.title-desc {
  margin-left: 18px;
  color: #98a2b3;
  font-size: 13px;
}

.w-full {
  width: 100%;
}

.help-icon {
  margin-left: 6px;
  color: #98a2b3;
  cursor: pointer;
  vertical-align: -2px;
}

.priority-form-item {
  margin-top: 4px;
}

.priority-control {
  width: 100%;
}

.priority-main {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  width: 100%;
}

.priority-slider {
  flex: 1;
  min-width: 420px;
  padding: 0 8px;
}

.priority-input {
  width: 110px;
  flex-shrink: 0;
}

.priority-tip {
  margin-top: 18px;
  color: #98a2b3;
  font-size: 13px;
  line-height: 20px;
}

.relation-form-item {
  margin-bottom: 14px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Element Plus 样式微调 */
:deep(.el-dialog) {
  border-radius: 8px;
}

:deep(.el-dialog__header) {
  padding: 20px 24px 12px;
  margin-right: 0;
}

:deep(.el-dialog__body) {
  padding: 0 24px 0;
}

:deep(.el-dialog__footer) {
  padding: 16px 24px;
  border-top: 1px solid #eaecf0;
}

:deep(.el-form-item) {
  margin-bottom: 14px;
}

:deep(.el-form-item__label) {
  color: #344054;
  font-weight: 500;
  font-size: 13px;
}

:deep(.el-textarea__inner) {
  resize: vertical;
}

/* Element Plus slider 微调 */
:deep(.el-slider) {
  height: 40px;
}

:deep(.el-slider__runway) {
  margin: 14px 0 24px;
}

:deep(.el-slider__marks-text) {
  margin-top: 6px;
  color: #98a2b3;
  font-size: 12px;
  white-space: nowrap;
}

:deep(.el-slider__bar) {
  background-color: #409eff;
}

:deep(.el-slider__button) {
  width: 16px;
  height: 16px;
  border: 2px solid #409eff;
}

/* 响应式 */
@media (max-width: 900px) {
  .priority-main {
    flex-direction: column;
    gap: 8px;
  }

  .priority-slider {
    width: 100%;
    min-width: 0;
  }

  .priority-input {
    width: 100%;
  }
}
</style>
