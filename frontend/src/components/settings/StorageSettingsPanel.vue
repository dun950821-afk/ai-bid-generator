<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-button type="primary" @click="showCreateDialog = true">新建配置</el-button>
    </div>

    <el-table :data="configs" v-loading="loading" border>
      <el-table-column prop="name" label="名称" width="150" />
      <el-table-column prop="provider" label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ row.provider }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="endpoint" label="端点" min-width="200" />
      <el-table-column prop="bucket" label="Bucket" width="120" />
      <el-table-column label="默认" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="代理" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.proxy_enabled" type="info" size="small">启用</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="testConnection(row)">测试</el-button>
          <el-button v-if="!row.is_default" type="success" link size="small" @click="setDefault(row)">
            设为默认
          </el-button>
          <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建配置弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建存储配置" width="600px">
      <el-form :model="createForm" label-width="140px">
        <el-form-item label="名称">
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="createForm.provider">
            <el-option label="MinIO" value="minio" />
            <el-option label="AWS S3" value="s3" />
            <el-option label="阿里云 OSS" value="oss" />
          </el-select>
        </el-form-item>
        <el-form-item label="内部端点">
          <el-input v-model="createForm.endpoint" placeholder="minio:9000" />
        </el-form-item>
        <el-form-item label="外部访问端点">
          <el-input v-model="createForm.public_endpoint" placeholder="浏览器访问地址" />
        </el-form-item>
        <el-form-item label="Access Key">
          <el-input v-model="createForm.access_key" />
        </el-form-item>
        <el-form-item label="Secret Key">
          <el-input v-model="createForm.secret_key" type="password" show-password />
        </el-form-item>
        <el-form-item label="Bucket">
          <el-input v-model="createForm.bucket" />
        </el-form-item>
        <el-form-item label="最大上传大小">
          <el-input-number v-model="createForm.max_upload_size_mb" :min="1" :max="500" />
          <span style="margin-left: 8px">MB</span>
        </el-form-item>
        <el-form-item label="启用代理">
          <el-switch v-model="createForm.proxy_enabled" />
          <div class="form-tip">启用后通过 nginx /minio/ 代理访问，避免 CORS</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createStorageConfig,
  deleteStorageConfig,
  setDefaultStorageConfig,
  testStorageConfig,
  type StorageConfig,
  type CreateStorageConfigParams,
} from '@/api/systemConfig'

const props = defineProps<{
  configs: StorageConfig[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const loading = ref(false)
const showCreateDialog = ref(false)
const creating = ref(false)

const createForm = ref<CreateStorageConfigParams>({
  name: '',
  provider: 'minio',
  endpoint: '',
  public_endpoint: '',
  access_key: '',
  secret_key: '',
  bucket: '',
  max_upload_size_mb: 100,
  proxy_enabled: true,
})

async function handleCreate() {
  creating.value = true
  try {
    await createStorageConfig(createForm.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    createForm.value = {
      name: '',
      provider: 'minio',
      endpoint: '',
      public_endpoint: '',
      access_key: '',
      secret_key: '',
      bucket: '',
      max_upload_size_mb: 100,
      proxy_enabled: true,
    }
    emit('refresh')
  } catch (e) {
    ElMessage.error('创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(config: StorageConfig) {
  try {
    await ElMessageBox.confirm(`确定删除配置「${config.name}」吗？`, '确认删除', { type: 'warning' })
    await deleteStorageConfig(config.id)
    ElMessage.success('删除成功')
    emit('refresh')
  } catch (e) {
    // 用户取消
  }
}

async function setDefault(config: StorageConfig) {
  try {
    await setDefaultStorageConfig(config.id)
    ElMessage.success('已设置为默认')
    emit('refresh')
  } catch (e) {
    ElMessage.error('操作失败')
  }
}

async function testConnection(config: StorageConfig) {
  try {
    const res = await testStorageConfig(config.id)
    if (res.data.success) {
      ElMessage.success(res.data.message)
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (e) {
    ElMessage.error('测试失败')
  }
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>