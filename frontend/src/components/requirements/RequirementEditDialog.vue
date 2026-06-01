<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="编辑条款"
    width="600px"
  >
    <el-form
      v-if="form"
      :model="form"
      label-width="100px"
    >
      <el-form-item label="条款编号">
        <el-input v-model="form.requirement_no" placeholder="如 ★1、2.1.3" />
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" />
      </el-form-item>
      <el-form-item label="摘要">
        <el-input v-model="form.summary" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="条款类型">
        <el-select v-model="form.requirement_type" style="width: 100%">
          <el-option label="资格要求" value="qualification" />
          <el-option label="技术要求" value="tech_req" />
          <el-option label="评分项" value="scoring" />
          <el-option label="商务条款" value="commercial" />
          <el-option label="合同法律" value="legal" />
          <el-option label="投标递交" value="submission" />
          <el-option label="履约周期" value="schedule" />
          <el-option label="材料要求" value="material" />
          <el-option label="文件格式" value="format" />
          <el-option label="澄清补遗" value="clarification" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item label="强制程度">
        <el-select v-model="form.mandatory_level" style="width: 100%">
          <el-option label="强制" value="mandatory" />
          <el-option label="重要" value="important" />
          <el-option label="可选" value="optional" />
          <el-option label="未知" value="unknown" />
        </el-select>
      </el-form-item>
      <el-form-item label="风险等级">
        <el-select v-model="form.risk_level" style="width: 100%">
          <el-option label="高" value="high" />
          <el-option label="中" value="medium" />
          <el-option label="低" value="low" />
          <el-option label="未知" value="unknown" />
        </el-select>
      </el-form-item>
      <el-form-item label="响应策略">
        <el-select v-model="form.response_strategy" style="width: 100%">
          <el-option label="待审核" value="pending_review" />
          <el-option label="完全响应" value="comply" />
          <el-option label="部分响应" value="partial" />
          <el-option label="偏离" value="deviation" />
          <el-option label="需说明" value="explain" />
          <el-option label="需提供材料" value="provide_material" />
        </el-select>
      </el-form-item>
      <el-form-item label="负责人">
        <el-select v-model="form.owner_role" style="width: 100%">
          <el-option label="标书经理" value="bid_manager" />
          <el-option label="销售" value="sales" />
          <el-option label="技术" value="tech" />
          <el-option label="法务" value="legal" />
          <el-option label="财务" value="finance" />
          <el-option label="项目经理" value="project_manager" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item label="审核状态">
        <el-select v-model="form.review_status" style="width: 100%">
          <el-option label="待审核" value="pending" />
          <el-option label="已审核" value="reviewed" />
          <el-option label="已确认" value="confirmed" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  updateRequirement,
  type RequirementDetail,
  type RequirementUpdatePayload,
} from '@/api/requirements'

const props = defineProps<{
  modelValue: boolean
  requirement: RequirementDetail | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const saving = ref(false)
const form = ref<RequirementUpdatePayload | null>(null)

// 监听 requirement 变化，初始化表单
watch(
  () => props.requirement,
  (newReq) => {
    if (newReq) {
      form.value = {
        requirement_no: newReq.requirement_no || '',
        title: newReq.title || '',
        summary: newReq.summary || '',
        requirement_type: newReq.requirement_type,
        mandatory_level: newReq.mandatory_level,
        risk_level: newReq.risk_level,
        response_strategy: newReq.response_strategy,
        owner_role: newReq.owner_role,
        review_status: newReq.review_status,
      }
    } else {
      form.value = null
    }
  },
  { immediate: true }
)

async function handleSave() {
  if (!props.requirement || !form.value) return

  saving.value = true
  try {
    await updateRequirement(props.requirement.id, form.value)
    ElMessage.success('保存成功')
    emit('update:modelValue', false)
    emit('saved')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>