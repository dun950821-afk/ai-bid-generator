<!-- 系统公告管理面板：发布/下线/编辑/删除（系统设置页 tab） -->
<template>
  <div class="announcement-panel">
    <div class="panel-toolbar">
      <span class="panel-desc">公告发布后，所有用户首次登录时弹出展示；用户可选择「不再提示」或「关闭」。</span>
      <el-button type="primary" :icon="Plus" @click="openCreate">发布公告</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '发布中' : '已下线' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="确认 / 不再提示" width="130" align="center">
        <template #default="{ row }">
          <span>{{ row.ack_count }}</span> / <span>{{ row.dismiss_count }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_by_name" label="发布人" width="100" show-overflow-tooltip />
      <el-table-column label="发布时间" width="160">
        <template #default="{ row }">{{ formatTime(row.published_at) || '-' }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">{{ formatTime(row.updated_at) || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.is_active" link type="primary" @click="handlePublish(row)">发布</el-button>
          <el-button v-else link type="warning" @click="handleOffline(row)">下线</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑公告' : '发布公告'"
      width="600px"
      append-to-body
    >
      <el-form :model="form" label-width="64px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="200" show-word-limit placeholder="公告标题，如：系统维护通知" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            placeholder="公告正文，支持换行"
          />
        </el-form-item>
        <el-form-item v-if="!editing" label="发布">
          <el-checkbox v-model="form.publish">保存后立即发布上线</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  offlineAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
  type AnnouncementManageItem,
} from '@/api/announcement'

const items = ref<AnnouncementManageItem[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref<AnnouncementManageItem | null>(null)

const form = reactive({
  title: '',
  content: '',
  publish: true,
})

function formatTime(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    const res = await listAnnouncements()
    items.value = res.data.results || []
  } catch {
    ElMessage.error('加载公告列表失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.title = ''
  form.content = ''
  form.publish = true
  dialogVisible.value = true
}

function openEdit(row: AnnouncementManageItem) {
  editing.value = row
  form.title = row.title
  form.content = row.content
  form.publish = true
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning('请填写内容')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateAnnouncement(editing.value.id, { title: form.title, content: form.content })
      ElMessage.success('公告已更新')
    } else {
      await createAnnouncement({ title: form.title, content: form.content, publish: form.publish })
      ElMessage.success(form.publish ? '公告已发布' : '公告已保存（未发布）')
    }
    dialogVisible.value = false
    await load()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function handlePublish(row: AnnouncementManageItem) {
  await publishAnnouncement(row.id)
  ElMessage.success('公告已发布上线')
  await load()
}

async function handleOffline(row: AnnouncementManageItem) {
  await ElMessageBox.confirm(`确定下线公告「${row.title}」吗？用户将不再看到该公告。`, '下线确认', {
    type: 'warning',
  })
  await offlineAnnouncement(row.id)
  ElMessage.success('公告已下线')
  await load()
}

async function handleDelete(row: AnnouncementManageItem) {
  await ElMessageBox.confirm(`确定删除公告「${row.title}」吗？删除后不可恢复。`, '删除确认', {
    type: 'warning',
  })
  await deleteAnnouncement(row.id)
  ElMessage.success('公告已删除')
  await load()
}

onMounted(load)
</script>

<style scoped>
.announcement-panel {
  padding: 4px 0;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}

.panel-desc {
  font-size: 13px;
  color: #909399;
}
</style>
