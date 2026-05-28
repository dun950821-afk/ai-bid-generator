<!-- frontend/src/views/admin/RoleListView.vue -->
<template>
  <div class="role-list">
    <div class="toolbar">
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新增角色
      </el-button>
    </div>

    <div class="content">
      <!-- 左侧角色列表 -->
      <div class="role-panel">
        <h3>角色列表</h3>
        <el-menu :default-active="selectedRoleId" @select="handleSelectRole">
          <el-menu-item
            v-for="role in roles"
            :key="role.id"
            :index="String(role.id)"
          >
            <span class="role-name">{{ role.name }}</span>
            <el-tag v-if="role.is_system" size="small" type="info">系统</el-tag>
          </el-menu-item>
        </el-menu>
      </div>

      <!-- 右侧权限配置 -->
      <div class="permission-panel" v-loading="loading">
        <div v-if="selectedRole" class="permission-header">
          <div class="role-info">
            <h3>{{ selectedRole.name }}</h3>
            <el-tag v-if="selectedRole.is_system" size="small" type="info">系统角色</el-tag>
          </div>
          <div class="actions">
            <el-button type="primary" size="small" @click="handleEditRole">
              编辑
            </el-button>
            <el-button
              v-if="!selectedRole.is_system"
              type="danger"
              size="small"
              @click="handleDeleteRole"
            >
              删除
            </el-button>
          </div>
        </div>
        <div v-else class="empty-tip">
          请选择一个角色查看权限
        </div>

        <div v-if="selectedRole" class="permission-tree">
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
      </div>
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
  await formRef.value.validate()

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

  const checkedKeys = treeRef.value.getCheckedKeys()
  const leafKeys = checkedKeys.filter((key: string) => !permissionTree.value.some(m => m.module === key))

  try {
    await roleApi.update(selectedRole.value.id, {
      permission_codes: leafKeys,
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
.role-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.content {
  display: flex;
  gap: 20px;
  min-height: 500px;
}

.role-panel {
  width: 280px;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.role-panel h3 {
  padding: 16px;
  margin: 0;
  border-bottom: 1px solid var(--el-border-color);
}

.role-panel .el-menu {
  border-right: none;
}

.role-panel .el-menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.role-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.permission-panel {
  flex: 1;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;
}

.permission-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
  margin-bottom: 16px;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-info h3 {
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}

.empty-tip {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 40px;
}

.permission-tree {
  max-height: 400px;
  overflow-y: auto;
}
</style>