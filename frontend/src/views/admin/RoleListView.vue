<!-- frontend/src/views/admin/RoleListView.vue -->
<template>
  <div class="role-page">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">角色与权限</h1>
        <p class="page-subtitle">管理角色及其菜单、操作权限，勾选变更自动保存</p>
      </div>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon class="mr-4"><Plus /></el-icon>
        新增角色
      </el-button>
    </header>

    <div class="content">
      <!-- 左侧角色列表 -->
      <aside class="panel role-panel">
        <div class="panel-header">
          <span class="panel-title">角色列表</span>
          <span class="panel-desc">{{ roles.length }} 个</span>
        </div>
        <div class="role-list-body" v-loading="loading && roles.length === 0">
          <div
            v-for="role in roles"
            :key="role.id"
            class="role-item"
            :class="{ active: selectedRoleId === String(role.id) }"
            @click="handleSelectRole(String(role.id))"
          >
            <div class="role-avatar" :class="{ system: role.is_system }">
              {{ role.name.slice(0, 1) }}
            </div>
            <div class="role-meta">
              <div class="role-name-row">
                <span class="role-name">{{ role.name }}</span>
                <el-tag v-if="role.is_system" size="small" type="info" effect="plain" round>系统</el-tag>
              </div>
              <div class="role-sub">{{ role.code }} · {{ role.permissions.length }} 项权限</div>
            </div>
          </div>
          <el-empty v-if="!loading && roles.length === 0" description="暂无角色" :image-size="70" />
        </div>
      </aside>

      <!-- 右侧权限配置 -->
      <section class="panel permission-panel" v-loading="loading">
        <template v-if="selectedRole">
          <div class="panel-header">
            <div class="role-info">
              <span class="panel-title">{{ selectedRole.name }}</span>
              <el-tag size="small" effect="plain" round>{{ selectedRole.code }}</el-tag>
              <el-tag v-if="selectedRole.is_system" size="small" type="info" effect="plain" round>系统角色</el-tag>
            </div>
            <div class="actions">
              <el-button size="small" @click="handleEditRole">编辑</el-button>
              <el-button
                v-if="!selectedRole.is_system"
                type="danger"
                size="small"
                plain
                @click="handleDeleteRole"
              >
                删除
              </el-button>
            </div>
          </div>
          <div v-if="selectedRole.description" class="role-desc">
            {{ selectedRole.description }}
          </div>
          <div class="permission-tree">
            <el-tree
              ref="treeRef"
              :data="permissionTree"
              :props="{ label: 'name', children: 'permissions' }"
              show-checkbox
              default-expand-all
              node-key="code"
              :default-checked-keys="selectedRole.permissions"
              @check="handleCheckChange"
            />
          </div>
        </template>
        <el-empty v-else description="请选择左侧角色查看权限" :image-size="90" class="panel-empty" />
      </section>
    </div>

    <!-- 新增/编辑角色弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingRole ? '编辑角色' : '新增角色'"
      width="500px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="角色码" prop="code" v-if="!editingRole">
          <el-input v-model="form.code" maxlength="64" placeholder="如：editor、viewer" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" maxlength="128" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { roleApi, permissionApi, type Role, type PermissionModule } from '@/api/admin'
import type { FormInstance, FormRules } from 'element-plus'

const loading = ref(false)
const roles = ref<Role[]>([])
const permissionTree = ref<PermissionModule[]>([])
const selectedRoleId = ref('')
const saving = ref(false)
const showCreateDialog = ref(false)
const editingRole = ref<Role | null>(null)

const formRef = ref<FormInstance>()
const treeRef = ref()
const form = ref({
  code: '',
  name: '',
  description: '',
})

const formRules: FormRules = {
  code: [
    { required: true, message: '请输入角色码', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]*$/, message: '角色码只能包含小写字母、数字和下划线，且以字母开头', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
  ],
}

const selectedRole = computed(() => {
  return roles.value.find(r => String(r.id) === selectedRoleId.value)
})

async function loadRoles() {
  loading.value = true
  try {
    const res = await roleApi.list()
    roles.value = res.data.results || []
    if (roles.value.length > 0 && !selectedRoleId.value) {
      selectedRoleId.value = String(roles.value[0].id)
    }
  } finally {
    loading.value = false
  }
}

async function loadPermissions() {
  const res = await permissionApi.tree()
  permissionTree.value = res.data || []
}

function handleSelectRole(id: string) {
  selectedRoleId.value = id
}

function resetForm() {
  editingRole.value = null
  form.value = {
    code: '',
    name: '',
    description: '',
  }
  formRef.value?.resetFields()
}

function handleEditRole() {
  if (!selectedRole.value) return
  editingRole.value = selectedRole.value
  form.value = {
    code: selectedRole.value.code,
    name: selectedRole.value.name,
    description: selectedRole.value.description || '',
  }
  showCreateDialog.value = true
}

async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    if (editingRole.value) {
      await roleApi.update(editingRole.value.id, {
        name: form.value.name,
        description: form.value.description,
      })
      ElMessage.success('角色已更新')
    } else {
      await roleApi.create({
        code: form.value.code,
        name: form.value.name,
        description: form.value.description,
      })
      ElMessage.success('角色已创建')
    }
    showCreateDialog.value = false
    loadRoles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function handleDeleteRole() {
  if (!selectedRole.value) return

  await ElMessageBox.confirm(
    `确定要删除角色 ${selectedRole.value.name} 吗？`,
    '删除确认',
    { type: 'warning' }
  )

  try {
    await roleApi.delete(selectedRole.value.id)
    ElMessage.success('角色已删除')
    selectedRoleId.value = ''
    loadRoles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '删除失败')
  }
}

async function handleCheckChange() {
  if (!selectedRole.value || !treeRef.value) return

  // 只获取叶子节点（权限），不包含父节点（模块）
  const checkedNodes = treeRef.value.getCheckedNodes()
  const permissionCodes = checkedNodes
    .filter((node: any) => node.code && node.code.includes('.'))
    .map((node: any) => node.code)

  try {
    await roleApi.update(selectedRole.value.id, {
      permission_codes: permissionCodes,
    })
    ElMessage.success('权限已更新')
    loadRoles()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '更新失败')
  }
}

// 监听角色选择，更新树的选中状态
watch(selectedRoleId, () => {
  nextTick(() => {
    if (treeRef.value && selectedRole.value) {
      treeRef.value.setCheckedKeys(selectedRole.value.permissions)
    }
  })
})

onMounted(() => {
  loadRoles()
  loadPermissions()
})
</script>

<style scoped>
.role-page {
  padding: 20px;
  background: var(--app-bg, #f6f8fb);
  min-height: calc(100vh - 60px);
}

/* 页头 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

.mr-4 {
  margin-right: 4px;
}

/* 布局 */
.content {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}

/* 通用面板 */
.panel {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.panel-desc {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

/* 角色列表 */
.role-list-body {
  padding: 8px;
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.role-item:hover {
  background: var(--app-bg, #f6f8fb);
}

.role-item.active {
  background: var(--app-primary-soft, #dbeafe);
}

.role-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  background: #dbeafe;
  color: #2563eb;
  flex-shrink: 0;
}

.role-avatar.system {
  background: #f1f5f9;
  color: #64748b;
}

.role-meta {
  flex: 1;
  min-width: 0;
}

.role-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-sub {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 权限面板 */
.permission-panel {
  min-height: 480px;
  display: flex;
  flex-direction: column;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.role-desc {
  padding: 10px 18px;
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
  border-bottom: 1px dashed var(--app-border, #e5e7eb);
}

.permission-tree {
  padding: 12px 18px 16px;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
}

.panel-empty {
  margin: auto;
  padding: 60px 0;
}

/* 响应式 */
@media (max-width: 900px) {
  .content {
    grid-template-columns: 1fr;
  }
  .role-list-body {
    max-height: 320px;
  }
}
</style>
