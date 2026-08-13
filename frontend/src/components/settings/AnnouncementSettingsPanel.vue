<!-- 系统公告管理面板：发布/下线/编辑/删除/测试预览（系统设置页 tab） -->
<template>
  <div class="announcement-panel">
    <div class="panel-toolbar">
      <span class="panel-desc">公告发布后，所有用户首次登录时弹出展示；用户可选择「不再提示」或「关闭」。可设置自动下线时间，到点自动下线。</span>
      <el-button type="primary" :icon="Plus" @click="openCreate">发布公告</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '发布中' : '已下线' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="自动下线" width="150">
        <template #default="{ row }">
          <span v-if="row.auto_offline_at">{{ formatTime(row.auto_offline_at) }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="确认 / 不再提示" width="130" align="center">
        <template #default="{ row }">
          <span>{{ row.ack_count }}</span> / <span>{{ row.dismiss_count }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_by_name" label="发布人" width="100" show-overflow-tooltip />
      <el-table-column label="发布时间" width="150">
        <template #default="{ row }">{{ formatTime(row.published_at) || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.is_active" link type="primary" @click="handlePublish(row)">发布</el-button>
          <el-button v-else link type="warning" @click="handleOffline(row)">下线</el-button>
          <el-button link type="success" @click="handleTest(row)">测试</el-button>
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
      <el-form :model="form" label-width="96px">
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
        <el-form-item label="自动下线">
          <el-date-picker
            v-model="form.auto_offline_at"
            type="datetime"
            placeholder="可选：到点自动下线，不选则长期发布"
            :clearable="true"
            style="width: 320px"
            value-format="YYYY-MM-DDTHH:mm:ss"
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

    <!-- 测试预览：样式与用户登录弹窗一致，不调 ack 不污染数据 -->
    <AnnouncementDialog
      :announcements="previewList"
      preview
      @finished="previewList = []"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import AnnouncementDialog from '@/components/announcement/AnnouncementDialog.vue'
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  offlineAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementManageItem,
} from '@/api/announcement'

const items = ref<AnnouncementManageItem[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref<AnnouncementManageItem | null>(null)
const previewList = ref<AnnouncementItem[]>([])

const form = reactive({
  title: '',
  content: '',
  publish: true,
  auto_offline_at: null as string | null,
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
  form.auto_offline_at = null
  dialogVisible.value = true
}

function openEdit(row: AnnouncementManageItem) {
  editing.value = row
  form.title = row.title
  form.content = row.content
  form.publish = true
  form.auto_offline_at = row.auto_offline_at
  dialogVisible.value = true
}

function handleTest(row: AnnouncementManageItem) {
  // 预览模式：复用登录弹窗组件，不调 ack，不污染用户数据
  previewList.value = [{
    id: row.id,
    title: row.title,
    content: row.content,
    published_at: row.published_at,
    updated_at: row.updated_at,
  }]
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
      const wasActive = editing.value.is_active
      await updateAnnouncement(editing.value.id, {
        title: form.title,
        content: form.content,
        auto_offline_at: form.auto_offline_at,
      })
      ElMessage.success(wasActive ? '公告已更新，已确认「不再提示」的用户将重新看到' : '公告已更新')
    } else {
      await createAnnouncement({
        title: form.title,
        content: form.content,
        publish: form.publish,
        auto_offline_at: form.auto_offline_at,
      })
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

.muted {
  color: #c0c4cc;
}
</style>
