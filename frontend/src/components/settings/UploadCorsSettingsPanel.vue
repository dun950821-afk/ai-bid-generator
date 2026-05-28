<template>
  <el-card shadow="never">
    <el-form :model="localSettings" label-width="160px">
      <el-form-item label="上传模式">
        <el-radio-group v-model="localSettings.upload_mode">
          <el-radio value="backend_proxy">后端代理上传（推荐）</el-radio>
          <el-radio value="presigned_direct">MinIO 直传（高级）</el-radio>
        </el-radio-group>
        <div class="form-tip">
          <template v-if="localSettings.upload_mode === 'backend_proxy'">
            浏览器文件上传到后端 API，由后端写入 MinIO。无需 CORS 配置，更稳定。
          </template>
          <template v-else>
            浏览器直接上传到 MinIO，需要配置 CORS。适合大文件或高并发场景。
          </template>
        </div>
      </el-form-item>

      <el-form-item label="最大上传大小">
        <el-input-number v-model="localSettings.max_upload_size_mb" :min="1" :max="500" />
        <span style="margin-left: 8px">MB</span>
      </el-form-item>

      <!-- CORS 配置（仅直传模式显示） -->
      <template v-if="localSettings.upload_mode === 'presigned_direct'">
        <el-divider>CORS 配置</el-divider>

        <el-form-item label="允许的域名">
          <el-input
            v-model="corsOriginsText"
            type="textarea"
            :rows="3"
            placeholder="每行一个域名，例如：http://localhost:5173"
          />
          <div class="form-tip">每行一个域名，支持 * 表示全部</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="generateCors">生成 CORS 配置</el-button>
        </el-form-item>

        <template v-if="corsCommand">
          <el-form-item label="应用命令">
            <pre class="command-block">{{ corsCommand }}</pre>
            <el-button type="primary" size="small" style="margin-top: 8px" @click="copyCorsCommand">
              复制命令
            </el-button>
          </el-form-item>
        </template>
      </template>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  generateCorsConfig,
  type SystemSettings,
  type StorageConfig,
} from '@/api/systemConfig'

const props = defineProps<{
  modelValue: SystemSettings
  storageConfigs: StorageConfig[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SystemSettings]
  save: []
}>()

const localSettings = ref({ ...props.modelValue })
const corsOriginsText = ref('')
const corsCommand = ref('')

watch(() => props.modelValue, (val) => {
  localSettings.value = { ...val }
}, { deep: true })

const defaultStorage = computed(() =>
  props.storageConfigs.find(c => c.is_default)
)

async function generateCors() {
  if (!defaultStorage.value) {
    ElMessage.warning('请先设置默认存储配置')
    return
  }

  const origins = corsOriginsText.value.split('\n').filter(o => o.trim())
  if (origins.length === 0) {
    ElMessage.warning('请输入允许的域名')
    return
  }

  try {
    const res = await generateCorsConfig(defaultStorage.value.id, origins)
    corsCommand.value = res.data.apply_command
    ElMessage.success('CORS 配置已生成')
  } catch (e) {
    ElMessage.error('生成失败')
  }
}

function copyCorsCommand() {
  navigator.clipboard.writeText(corsCommand.value)
  ElMessage.success('已复制')
}

function handleSave() {
  emit('update:modelValue', localSettings.value)
  emit('save')
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.command-block {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow: auto;
  max-height: 300px;
}
</style>