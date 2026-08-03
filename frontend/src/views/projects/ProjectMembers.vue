<template>
  <div class="project-members">
    <div class="toolbar">
      <el-button v-if="canManage" type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加成员
      </el-button>
    </div>

    <el-table :data="members" v-loading="loading" border>
      <el-table-column label="用户" min-width="180">
        <template #default="{ row }">
          <div class="user-cell">
            <el-avatar :size="32" :src="row.avatar_url">
              {{ row.real_name?.charAt(0) || row.username?.charAt(0) }}
            </el-avatar>
            <div class="user-info">
              <span class="username">{{ row.real_name || row.username }}</span>
              <span class="user-id">@{{ row.username }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="150">
        <template #default="{ row }">
          <el-select
            v-if="canManage && row.role_code !== 'owner'"
            v-model="row.project_role"
            :options="roleOptions"
            @change="handleRoleChange(row)"
          />
          <el-tag v-else :type="getRoleTagType(row.role_code)" size="small">
            {{ row.role_name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="加入时间" prop="created_at" width="140">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" v-if="canManage">
        <template #default="{ row }">
          <el-button
            v-if="row.role_code !== 'owner'"
            type="danger"
            link
            @click="handleRemove(row)"
          >
            移除
          </el-button>
          <span v-else class="disabled">-</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加成员弹窗 -->
    <el-dialog v-model="showAddDialog" title="添加成员" width="400px">
      <el-form :model="addForm" label-width="80px">
        <el-form-item label="用户">
          <el-select
            v-model="addForm.user_id"
            filterable
            remote
            reserve-keyword
            :remote-method="searchCandidates"
            :loading="searching"
            placeholder="输入用户名或姓名搜索"
            style="width: 100%"
            @clear="candidates = []"
          >
            <el-option
              v-for="u in candidates"
              :key="u.id"
              :label="`${u.real_name || u.username}（@${u.username}）`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="addForm.role_id" placeholder="选择角色">
            <el-option
              v-for="role in roles"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="handleAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { memberApi, roleApi, type ProjectMember, type ProjectRole } from '@/api/project'
import { http } from '@/api/http'

const props = defineProps<{
  projectId: number
  canManage: boolean
}>()

const loading = ref(false)
const members = ref<ProjectMember[]>([])
const roles = ref<ProjectRole[]>([])
const showAddDialog = ref(false)
const adding = ref(false)
const searching = ref(false)
const candidates = ref<Array<{ id: number; username: string; real_name: string }>>([])
const addForm = ref({ user_id: undefined as number | undefined, role_id: undefined as number | undefined })

const roleOptions = computed(() =>
  roles.value.map(r => ({ label: r.name, value: r.id }))
)

async function loadMembers() {
  loading.value = true
  try {
    const res = await memberApi.list(props.projectId)
    members.value = res.data.results || []
  } finally {
    loading.value = false
  }
}

async function loadRoles() {
  const res = await roleApi.list(props.projectId)
  roles.value = res.data.results || []
}

async function handleRoleChange(member: ProjectMember) {
  try {
    await memberApi.update(props.projectId, member.id, { role_id: member.project_role })
    ElMessage.success('角色已更新')
    loadMembers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '更新失败')
    loadMembers()
  }
}

async function handleRemove(member: ProjectMember) {
  await ElMessageBox.confirm(`确定要移除成员 ${member.real_name || member.username} 吗？`, '移除确认', {
    type: 'warning',
  })
  try {
    await memberApi.remove(props.projectId, member.id)
    ElMessage.success('成员已移除')
    loadMembers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '移除失败')
  }
}

async function searchCandidates(query: string) {
  if (!query) {
    candidates.value = []
    return
  }
  searching.value = true
  try {
    const res = await http.get<Array<{ id: number; username: string; real_name: string }>>(
      `/api/projects/${props.projectId}/member-candidates/`,
      { params: { q: query } }
    )
    candidates.value = res.data
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '搜索用户失败')
  } finally {
    searching.value = false
  }
}

async function handleAdd() {
  if (!addForm.value.user_id || !addForm.value.role_id) {
    ElMessage.warning('请选择用户和角色')
    return
  }
  adding.value = true
  try {
    await memberApi.add(props.projectId, {
      user_id: addForm.value.user_id,
      role_id: addForm.value.role_id,
    })
    ElMessage.success('成员已添加')
    showAddDialog.value = false
    addForm.value = { user_id: undefined, role_id: undefined }
    candidates.value = []
    loadMembers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '添加失败')
  } finally {
    adding.value = false
  }
}

function getRoleTagType(code: string) {
  const map: Record<string, string> = {
    owner: 'danger',
    editor: 'primary',
    reviewer: 'success',
    viewer: 'info',
  }
  return map[code] || 'info'
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(() => {
  loadMembers()
  loadRoles()
})
</script>

<style scoped>
.project-members {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.username {
  font-weight: 500;
}

.user-id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.disabled {
  color: var(--el-text-color-placeholder);
}
</style>