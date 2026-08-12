<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>企业项目人员</span>
          <div>
            <el-input
              v-model="keyword"
              placeholder="搜索姓名"
              clearable
              style="width: 180px; margin-right: 8px"
              @change="load"
            />
            <el-button type="primary" @click="openDialog()">新增人员</el-button>
          </div>
        </div>
      </template>

      <el-table :data="members" v-loading="loading" stripe>
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="role" label="角色/岗位" min-width="140" show-overflow-tooltip />
        <el-table-column prop="title" label="职称" width="120" show-overflow-tooltip />
        <el-table-column label="工作年限" width="100">
          <template #default="{ row }">{{ row.experience_years ? row.experience_years + ' 年' : '-' }}</template>
        </el-table-column>
        <el-table-column prop="certificates" label="专业证书" min-width="160" show-overflow-tooltip />
        <el-table-column prop="projects" label="项目经历" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && !members.length" description="暂无人员, 点击右上角新增" />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑人员' : '新增人员'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="角色/岗位">
          <el-input v-model="form.role" placeholder="如: 项目经理 / 高级安全顾问" />
        </el-form-item>
        <el-form-item label="职称">
          <el-input v-model="form.title" placeholder="如: 高级工程师" />
        </el-form-item>
        <el-form-item label="工作年限">
          <el-input-number v-model="form.experience_years" :min="0" :max="60" style="width: 160px" />
        </el-form-item>
        <el-form-item label="专业证书">
          <el-input v-model="form.certificates" placeholder="如: CISP, CISSP, PMP" />
        </el-form-item>
        <el-form-item label="项目经历">
          <el-input v-model="form.projects" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createMember,
  deleteMember,
  getMemberList,
  updateMember,
  type ProjectMember,
} from '@/api/enterprise'

const loading = ref(false)
const saving = ref(false)
const members = ref<ProjectMember[]>([])
const keyword = ref('')
const dialogVisible = ref(false)

const emptyForm = () => ({
  id: 0,
  name: '',
  role: '',
  title: '',
  experience_years: null as number | null,
  certificates: '',
  projects: '',
})

const form = reactive(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await getMemberList({ keyword: keyword.value || undefined })
    members.value = data
  } catch (e) {
    ElMessage.error('加载人员失败')
  } finally {
    loading.value = false
  }
}

function openDialog(row?: ProjectMember) {
  Object.assign(form, emptyForm(), row ? {
    id: row.id,
    name: row.name,
    role: row.role,
    title: row.title,
    experience_years: row.experience_years,
    certificates: row.certificates,
    projects: row.projects,
  } : {})
  dialogVisible.value = true
}

async function save() {
  if (!form.name) {
    ElMessage.warning('请填写姓名')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      role: form.role,
      title: form.title,
      experience_years: form.experience_years,
      certificates: form.certificates,
      projects: form.projects,
    }
    if (form.id) {
      await updateMember(form.id, payload)
    } else {
      await createMember(payload)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: ProjectMember) {
  try {
    await ElMessageBox.confirm(`确认删除人员「${row.name}」?`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteMember(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
