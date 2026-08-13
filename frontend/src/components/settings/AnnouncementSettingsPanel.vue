<!-- 系统公告管理面板：发布/下线/编辑/删除/测试预览（系统设置页 tab） -->
<template>
  <div class="announcement-panel">
    <div class="panel-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-title">
          <el-icon :size="18"><Promotion /></el-icon>
          <span>系统公告管理</span>
        </div>
        <span class="panel-desc">公告发布后，所有用户首次登录时弹出展示；可设置自动下线时间，到点自动下线。</span>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">发布公告</el-button>
    </div>

    <!-- 公告卡片列表 -->
    <div v-loading="loading" class="announcement-list">
      <transition-group name="ann-card" tag="div" class="ann-card-group">
        <div
          v-for="row in items"
          :key="row.id"
          class="ann-card"
          :class="{ offline: !row.is_active }"
        >
          <!-- 状态色条 -->
          <div class="ann-status-bar" :class="row.is_active ? 'is-live' : 'is-off'"></div>

          <div class="ann-card-main">
            <div class="ann-card-head">
              <div class="ann-title-row">
                <span class="ann-title">{{ row.title }}</span>
                <el-tag
                  size="small"
                  :type="row.is_active ? 'success' : 'info'"
                  effect="light"
                  round
                  class="ann-status-tag"
                >
                  <span class="status-dot" :class="row.is_active ? 'live' : 'off'"></span>
                  {{ row.is_active ? '发布中' : '已下线' }}
                </el-tag>
              </div>
              <div class="ann-actions">
                <el-tooltip content="测试弹窗效果" placement="top">
                  <el-button circle size="small" type="success" plain :icon="VideoPlay" @click="handleTest(row)" />
                </el-tooltip>
                <el-tooltip content="编辑" placement="top">
                  <el-button circle size="small" plain :icon="Edit" @click="openEdit(row)" />
                </el-tooltip>
                <el-tooltip :content="row.is_active ? '下线' : '发布上线'" placement="top">
                  <el-button
                    circle
                    size="small"
                    :type="row.is_active ? 'warning' : 'primary'"
                    plain
                    :icon="row.is_active ? Download : Upload"
                    @click="row.is_active ? handleOffline(row) : handlePublish(row)"
                  />
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button circle size="small" type="danger" plain :icon="Delete" @click="handleDelete(row)" />
                </el-tooltip>
              </div>
            </div>

            <div class="ann-content">{{ row.content }}</div>

            <div class="ann-meta">
              <span class="meta-item">
                <el-icon :size="13"><User /></el-icon>
                <span>{{ row.created_by_name || '系统' }}</span>
              </span>
              <span v-if="row.is_active" class="meta-item">
                <el-icon :size="13"><Clock /></el-icon>
                <span>发布 {{ formatTime(row.published_at) }}</span>
              </span>
              <span v-else-if="row.offline_at" class="meta-item">
                <el-icon :size="13"><CircleClose /></el-icon>
                <span>下线 {{ formatTime(row.offline_at) }}</span>
              </span>
              <span v-if="row.auto_offline_at" class="meta-item auto-offline">
                <el-icon :size="13"><Timer /></el-icon>
                <span>自动下线 {{ formatTime(row.auto_offline_at) }}</span>
              </span>
              <span class="meta-item ack-info">
                <el-icon :size="13"><View /></el-icon>
                <span>已确认 {{ row.ack_count }} · 不再提示 {{ row.dismiss_count }}</span>
              </span>
            </div>
          </div>
        </div>
      </transition-group>

      <el-empty v-if="!loading && items.length === 0" description="暂无公告，点击右上角「发布公告」创建" />
    </div>

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
import {
  CircleClose,
  Clock,
  Delete,
  Download,
  Edit,
  Plus,
  Promotion,
  Timer,
  Upload,
  User,
  VideoPlay,
  View,
} from '@element-plus/icons-vue'
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
  margin-bottom: 16px;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.panel-desc {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 公告卡片列表 ---------- */
.announcement-list {
  min-height: 120px;
}

.ann-card-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ann-card {
  position: relative;
  display: flex;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.ann-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.ann-card.offline {
  background: #fafafa;
}

.ann-status-bar {
  width: 4px;
  flex-shrink: 0;
}

.ann-status-bar.is-live {
  background: linear-gradient(180deg, #67c23a, #95d475);
}

.ann-status-bar.is-off {
  background: #dcdfe6;
}

.ann-card-main {
  flex: 1;
  min-width: 0;
  padding: 14px 16px 12px;
}

.ann-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.ann-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ann-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ann-card.offline .ann-title {
  color: #909399;
}

.ann-status-tag {
  flex-shrink: 0;
}

.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: 1px;
}

.status-dot.live {
  background: #67c23a;
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.18);
}

.status-dot.off {
  background: #909399;
}

.ann-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ann-content {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  margin-bottom: 10px;
}

.ann-card.offline .ann-content {
  color: #a8abb2;
}

.ann-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 12px;
  color: #909399;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-item .el-icon {
  color: #b0b3b8;
}

.meta-item.auto-offline .el-icon {
  color: #e6a23c;
}

.meta-item.ack-info .el-icon {
  color: #409eff;
}

/* 卡片切换动画 */
.ann-card-enter-active,
.ann-card-leave-active {
  transition: all 0.25s ease;
}

.ann-card-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.ann-card-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.ann-card-leave-active {
  position: absolute;
  width: 100%;
}
</style>
