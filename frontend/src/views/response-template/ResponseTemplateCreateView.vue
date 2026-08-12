<template>
  <div class="page-container" v-loading="creating">
    <el-card shadow="never" v-if="creating">
      <el-skeleton :rows="6" animated />
    </el-card>
    <el-card shadow="never" v-else-if="error">
      <el-alert type="error" :title="error" show-icon :closable="false" />
      <el-button style="margin-top: 16px" @click="router.push('/response-templates')">返回列表</el-button>
    </el-card>
    <template v-else-if="templateId">
      <ResponseTemplateDetailView :template-id="templateId" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createResponseTemplate } from '@/api/responseTemplate'
import ResponseTemplateDetailView from './ResponseTemplateDetailView.vue'

const route = useRoute()
const router = useRouter()
const creating = ref(true)
const error = ref('')
const templateId = ref<number | null>(null)

onMounted(async () => {
  const tenderFileId = Number(route.query.tender_file_id || 0)
  if (!tenderFileId) {
    error.value = '缺少招标文件参数'
    creating.value = false
    return
  }
  try {
    const { data } = await createResponseTemplate(tenderFileId)
    templateId.value = data.id
    router.replace(`/response-templates/${data.id}`)
  } catch (e: any) {
    error.value = e?.response?.data?.detail || '创建响应模板失败'
    ElMessage.error(error.value)
  } finally {
    creating.value = false
  }
})
</script>
