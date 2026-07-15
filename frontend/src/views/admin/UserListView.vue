<!-- frontend/src/views/admin/UserListView.vue -->
<template>
  <div class="user-list">
    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索用户名、姓名、邮箱"
        clearable
        style="width: 280px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新增用户
      </el-button>
    </div>

    <el-table :data="users" v-loading="loading" border>
      <el-table-column label="用户名" prop="username" width="120" />
      <el-table-column label="姓名" prop="real_name" width="120">
        <template #default="{ row }">
          {{ row.real_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="邮箱" prop="email" width="180">
        <template #default="{ row }">
          {{ row.email || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="手机号" prop="phone" width="140">
        <template #default="{ row }">
          {{ row.phone || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="150">
        <template #default="{ row }">
          <el-tag v-for="role in row.roles" :key="role.id" size="small" class="role-tag">
            {{ role.name }}
          </el-tag>
          <span v-if="!row.roles.length">-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'danger'" size="small">
            {{ row.is_active ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="160">
        <template #default="{ row }">
          {{ row.last_login ? formatDate(row.last_login) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
          <el-button type="warning" link @click="handleResetPassword(row)">重置密码</el-button>
          <el-button
            v-if="row.is_active"
            type="danger"
            link
            @click="handleDisable(row)"
          >
            禁用
          </el-button>
          <el-button
            v-else
            type="success"
            link
            @click="handleEnable(row)"
          >
            启用
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑用户弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingUser ? '编辑用户' : '新增用户'"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="用户名" prop="username" v-if="!editingUser">
          <el-input v-model="form.username" maxlength="64" />
        </el-form-item>
        <el-form-item label="姓名" prop="real_name">
          <el-input v-model="form.real_name" maxlength="64" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" maxlength="128" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" maxlength="32" />
        </el-form-item>
        <el-form-item label="部门" prop="department">
          <el-input v-model="form.department" maxlength="128" />
        </el-form-item>
        <el-form-item label="密码" prop="password" v-if="!editingUser">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="留空则生成临时密码"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role_ids">
          <el-select v-model="form.role_ids" multiple placeholder="选择角色" style="width: 100%">
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
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码结果弹窗 -->
    <el-dialog v-model="showPasswordDialog" title="重置密码成功" width="400px">
      <div class="password-result">
        <p>临时密码已生成，请通知用户尽快登录并修改密码：</p>
        <el-input v-model="tempPassword" readonly>
          <template #append>
            <el-button @click="copyPassword">复制</el-button>
          </template>
        </el-input>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { userApi, roleApi, type User, type Role } from '@/api/admin'
import type { FormInstance, FormRules } from 'element-plus'

const loading = ref(false)
const users = ref<User[]>([])
const roles = ref<Role[]>([])
const searchText = ref('')

const showCreateDialog = ref(false)
const showPasswordDialog = ref(false)
const editingUser = ref<User | null>(null)
const saving = ref(false)
const tempPassword = ref('')

const formRef = ref<FormInstance>()
const form = ref({
  username: '',
  real_name: '',
  email: '',
  phone: '',
  department: '',
  password: '',
  role_ids: [] as number[],
})

const formRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 64, message: '用户名长度 3-64 个字符', trigger: 'blur' },
  ],
  email: [
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await userApi.list({ search: searchText.value })
    users.value = res.data.results || []
  } finally {
    loading.value = false
  }
}

async function loadRoles() {
  const res = await roleApi.list()
  roles.value = res.data.results || []
}

function handleSearch() {
  loadUsers()
}

function resetForm() {
  editingUser.value = null
  form.value = {
    username: '',
    real_name: '',
    email: '',
    phone: '',
    department: '',
    password: '',
    role_ids: [],
  }
  formRef.value?.resetFields()
}

function handleEdit(user: User) {
  editingUser.value = user
  form.value = {
    username: user.username,
    real_name: user.real_name || '',
    email: user.email || '',
    phone: user.phone || '',
    department: user.department || '',
    password: '',
    role_ids: user.roles.map(r => r.id),
  }
  showCreateDialog.value = true
}

async function handleSave() {
  if (!formRef.value) return
  await formRef.value.validate()

  saving.value = true
  try {
    if (editingUser.value) {
      await userApi.update(editingUser.value.id, {
        real_name: form.value.real_name,
        email: form.value.email,
        phone: form.value.phone,
        department: form.value.department,
        role_ids: form.value.role_ids,
      })
      ElMessage.success('用户已更新')
    } else {
      await userApi.create({
        username: form.value.username,
        real_name: form.value.real_name,
        email: form.value.email,
        phone: form.value.phone,
        department: form.value.department,
        password: form.value.password || undefined,
        role_ids: form.value.role_ids,
      })
      ElMessage.success('用户已创建')
    }
    showCreateDialog.value = false
    loadUsers()
  } catch (err: any) {
    ElMessage.error(extractApiError(err, '操作失败'))
  } finally {
    saving.value = false
  }
}

function extractApiError(err: any, fallback: string): string {
  const data = err.response?.data
  if (!data) return err.message || fallback
  const parts: string[] = []
  if (data.message) parts.push(data.message)
  const detail = data.detail
  if (detail && typeof detail === 'object') {
    for (const [field, msgs] of Object.entries(detail)) {
      const text = Array.isArray(msgs) ? msgs.join('、') : String(msgs)
      parts.push(`${field}: ${text}`)
    }
  } else if (typeof detail === 'string' && detail) {
    parts.push(detail)
  }
  return parts.length ? parts.join('；') : fallback
}

async function handleResetPassword(user: User) {
  await ElMessageBox.confirm(
    `确定要重置用户 ${user.real_name || user.username} 的密码吗？`,
    '重置密码确认',
    { type: 'warning' }
  )
  try {
    const res = await userApi.resetPassword(user.id)
    tempPassword.value = res.data.temporary_password
    showPasswordDialog.value = true
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '重置失败')
  }
}

function copyPassword() {
  navigator.clipboard.writeText(tempPassword.value)
  ElMessage.success('已复制')
}

async function handleDisable(user: User) {
  await ElMessageBox.confirm(
    `确定要禁用用户 ${user.real_name || user.username} 吗？`,
    '禁用确认',
    { type: 'warning' }
  )
  try {
    await userApi.delete(user.id)
    ElMessage.success('用户已禁用')
    loadUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '禁用失败')
  }
}

async function handleEnable(user: User) {
  try {
    await userApi.enable(user.id)
    ElMessage.success('用户已启用')
    loadUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '启用失败')
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadUsers()
  loadRoles()
})
</script>

<style scoped>
.user-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  justify-content: flex-end;
}

.role-tag {
  margin-right: 4px;
}

.password-result {
  padding: 16px 0;
}

.password-result p {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
}
</style>