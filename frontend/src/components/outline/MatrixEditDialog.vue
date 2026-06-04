<!-- frontend/src/components/outline/MatrixEditDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="编辑内容责任矩阵"
    width="800px"
    destroy-on-close
    @close="handleClose"
  >
    <el-alert
      v-if="versionConflict"
      type="error"
      title="版本冲突"
      description="矩阵内容已被其他操作更新，请刷新后再编辑。"
      :closable="false"
      show-icon
    />

    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="120px"
      class="matrix-form"
    >
      <!-- 章节定位 -->
      <el-form-item label="章节定位" prop="section_role">
        <el-select v-model="formData.section_role" placeholder="选择章节定位" style="width: 100%">
          <el-option label="资格证明" value="qualification" />
          <el-option label="技术方案" value="technical_solution" />
          <el-option label="商务响应" value="business_response" />
          <el-option label="服务方案" value="service_plan" />
          <el-option label="团队介绍" value="team_intro" />
          <el-option label="附件材料" value="attachment" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>

      <!-- 写作范围 -->
      <el-form-item label="本章写什么" prop="write_scope">
        <el-input
          v-model="formData.write_scope"
          type="textarea"
          :rows="4"
          placeholder="详细说明本章负责的内容范围"
        />
      </el-form-item>

      <!-- 排除范围 -->
      <el-form-item label="本章不写什么" prop="exclude_scope">
        <el-input
          v-model="formData.exclude_scope"
          type="textarea"
          :rows="3"
          placeholder="明确说明本章不负责的内容"
        />
      </el-form-item>

      <!-- 建议表达形式 -->
      <el-form-item label="表达形式" prop="expression_form">
        <el-select v-model="formData.expression_form" placeholder="选择表达形式" style="width: 100%">
          <el-option label="正文" value="body_text" />
          <el-option label="表格" value="table" />
          <el-option label="承诺函" value="commitment_letter" />
          <el-option label="证明材料" value="certificate" />
          <el-option label="附件索引" value="attachment_index" />
          <el-option label="简历表" value="resume_table" />
          <el-option label="混合形式" value="mixed" />
        </el-select>
      </el-form-item>

      <!-- 写作深度 -->
      <el-form-item label="写作深度" prop="writing_depth">
        <el-select v-model="formData.writing_depth" placeholder="选择写作深度" style="width: 100%">
          <el-option label="概述" value="overview" />
          <el-option label="适度展开" value="moderate" />
          <el-option label="详细展开" value="detailed" />
        </el-select>
      </el-form-item>

      <!-- 生成优先级 -->
      <el-form-item label="生成优先级" prop="generation_priority">
        <el-slider
          v-model="formData.generation_priority"
          :min="0"
          :max="100"
          :step="10"
          show-stops
          :marks="priorityMarks"
        />
        <div class="priority-hint">
          <span>数值越大，正文生成越靠前。叶子章节建议 80-100，父章节建议 20-40。</span>
        </div>
      </el-form-item>

      <!-- AI 划分说明 -->
      <el-form-item label="AI 划分说明">
        <el-input
          v-model="formData.ai_reasoning_summary"
          type="textarea"
          :rows="2"
          disabled
          placeholder="AI 生成的边界划分依据"
        />
      </el-form-item>

      <!-- 人工备注 -->
      <el-form-item label="人工备注">
        <el-input
          v-model="formData.manual_notes"
          type="textarea"
          :rows="3"
          placeholder="补充自定义要求（高优先级）"
        />
      </el-form-item>

      <!-- 引用章节 -->
      <el-form-item label="可引用章节">
        <el-tag
          v-for="section in formData.reference_sections"
          :key="section.id"
          type="info"
          class="section-tag"
          closable
          @close="removeReferenceSection(section.id)"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showReferenceSelector = true">
          添加引用
        </el-button>
      </el-form-item>

      <!-- 禁止重复章节 -->
      <el-form-item label="禁止重复章节">
        <el-tag
          v-for="section in formData.no_duplicate_sections"
          :key="section.id"
          type="warning"
          class="section-tag"
          closable
          @close="removeNoDuplicateSection(section.id)"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showNoDuplicateSelector = true">
          添加禁止
        </el-button>
      </el-form-item>

      <!-- 依赖章节 -->
      <el-form-item label="依赖章节">
        <el-tag
          v-for="section in formData.dependency_sections"
          :key="section.id"
          type="success"
          class="section-tag"
          closable
          @close="removeDependencySection(section.id)"
        >
          {{ section.section_number }} {{ section.title }}
        </el-tag>
        <el-button text type="primary" @click="showDependencySelector = true">
          添加依赖
        </el-button>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
    </template>
  </el-dialog>

  <!-- 章节选择器对话框 -->
  <el-dialog
    v-model="showReferenceSelector"
    title="选择可引用章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedReferenceIds">
      <div v-for="section in allSections" :key="section.id" class="section-checkbox">
        <el-checkbox
          :label="section.id"
          :disabled="section.id === currentSectionId"
        >
          {{ section.section_number }} {{ section.title }}
        </el-checkbox>
      </div>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showReferenceSelector = false">取消</el-button>
      <el-button type="primary" @click="confirmReferenceSelection">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showNoDuplicateSelector"
    title="选择禁止重复章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedNoDuplicateIds">
      <div v-for="section in allSections" :key="section.id" class="section-checkbox">
        <el-checkbox
          :label="section.id"
          :disabled="section.id === currentSectionId"
        >
          {{ section.section_number }} {{ section.title }}
        </el-checkbox>
      </div>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showNoDuplicateSelector = false">取消</el-button>
      <el-button type="primary" @click="confirmNoDuplicateSelection">确认</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showDependencySelector"
    title="选择依赖章节"
    width="500px"
  >
    <el-checkbox-group v-model="selectedDependencyIds">
      <div v-for="section in allSections" :key="section.id" class="section-checkbox">
        <el-checkbox
          :label="section.id"
          :disabled="section.id === currentSectionId"
        >
          {{ section.section_number }} {{ section.title }}
        </el-checkbox>
      </div>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="showDependencySelector = false">取消</el-button>
      <el-button type="primary" @click="confirmDependencySelection">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getSectionMatrix, updateSectionMatrix, type ContentMatrix, type SectionMatrix } from '@/api/outline'

const props = defineProps<{
  sectionId: number
  currentSectionId: number
  allSections: Array<{ id: number; section_number: string; title: string }>
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const visible = defineModel<boolean>('visible')
const saving = ref(false)
const versionConflict = ref(false)

const formRef = ref<FormInstance>()
const originalVersion = ref(1)

const formData = ref<Partial<ContentMatrix>>({
  section_role: '',
  write_scope: '',
  exclude_scope: '',
  reference_sections: [],
  no_duplicate_sections: [],
  dependency_sections: [],
  expression_form: 'body_text',
  writing_depth: 'detailed',
  related_requirements: [],
  generation_priority: 50,
  ai_reasoning_summary: '',
  manual_notes: '',
})

const formRules: FormRules = {
  write_scope: [
    { required: true, message: '请填写本章写什么', trigger: 'blur' },
    { min: 10, message: '写作范围描述至少 10 个字符', trigger: 'blur' },
  ],
}

const priorityMarks = {
  0: '最后',
  20: '父章节',
  50: '普通',
  80: '优先',
  100: '最优先',
}

// 章节选择器
const showReferenceSelector = ref(false)
const showNoDuplicateSelector = ref(false)
const showDependencySelector = ref(false)

const selectedReferenceIds = ref<number[]>([])
const selectedNoDuplicateIds = ref<number[]>([])
const selectedDependencyIds = ref<number[]>([])

// 加载矩阵数据
async function loadMatrix() {
  try {
    const res = await getSectionMatrix(props.sectionId)
    const data = res.data as SectionMatrix

    originalVersion.value = data.content_matrix_version
    if (data.content_matrix) {
      formData.value = { ...data.content_matrix }
    }

    // 初始化选中列表
    selectedReferenceIds.value = formData.value.reference_sections?.map(s => s.id) || []
    selectedNoDuplicateIds.value = formData.value.no_duplicate_sections?.map(s => s.id) || []
    selectedDependencyIds.value = formData.value.dependency_sections?.map(s => s.id) || []

    versionConflict.value = false
  } catch (err) {
    console.error('加载矩阵失败:', err)
    ElMessage.error('加载矩阵失败')
  }
}

// 移除引用章节
function removeReferenceSection(id: number) {
  formData.value.reference_sections = formData.value.reference_sections?.filter(s => s.id !== id) || []
  selectedReferenceIds.value = selectedReferenceIds.value.filter(i => i !== id)
}

// 移除禁止重复章节
function removeNoDuplicateSection(id: number) {
  formData.value.no_duplicate_sections = formData.value.no_duplicate_sections?.filter(s => s.id !== id) || []
  selectedNoDuplicateIds.value = selectedNoDuplicateIds.value.filter(i => i !== id)
}

// 移除依赖章节
function removeDependencySection(id: number) {
  formData.value.dependency_sections = formData.value.dependency_sections?.filter(s => s.id !== id) || []
  selectedDependencyIds.value = selectedDependencyIds.value.filter(i => i !== id)
}

// 确认引用章节选择
function confirmReferenceSelection() {
  formData.value.reference_sections = selectedReferenceIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showReferenceSelector.value = false
}

// 确认禁止重复章节选择
function confirmNoDuplicateSelection() {
  formData.value.no_duplicate_sections = selectedNoDuplicateIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showNoDuplicateSelector.value = false
}

// 确认依赖章节选择
function confirmDependencySelection() {
  formData.value.dependency_sections = selectedDependencyIds.value
    .map(id => props.allSections.find(s => s.id === id))
    .filter(Boolean)
    .map(s => ({ id: s!.id, section_number: s!.section_number, title: s!.title }))
  showDependencySelector.value = false
}

// 保存矩阵
async function handleSave() {
  if (!formRef.value) return

  await formRef.value.validate()

  saving.value = true
  versionConflict.value = false

  try {
    const res = await updateSectionMatrix(props.sectionId, {
      content_matrix_version: originalVersion.value,
      content_matrix: formData.value,
    })

    const result = res.data as any
    if (result.success) {
      ElMessage.success('矩阵已保存')
      emit('saved')
      visible.value = false
    } else if (result.error_code === 'VERSION_CONFLICT') {
      versionConflict.value = true
      ElMessage.error('矩阵已被其他操作更新，请刷新后重试')
    }
  } catch (err: any) {
    if (err.response?.data?.error_code === 'VERSION_CONFLICT') {
      versionConflict.value = true
      ElMessage.error('矩阵已被其他操作更新，请刷新后重试')
    } else {
      console.error('保存矩阵失败:', err)
      ElMessage.error(err.response?.data?.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

function handleClose() {
  visible.value = false
}

// 监听对话框打开，加载数据
watch(visible, (val) => {
  if (val) {
    loadMatrix()
  }
})
</script>

<style scoped>
.matrix-form {
  max-height: 500px;
  overflow-y: auto;
}

.section-tag {
  margin-right: 8px;
  margin-bottom: 4px;
}

.priority-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.section-checkbox {
  margin-bottom: 8px;
}
</style>