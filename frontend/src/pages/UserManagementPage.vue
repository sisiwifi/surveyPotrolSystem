<template>
  <section class="user-page">
    <BreadcrumbHeader
      :show-back="true"
      :crumbs="headerCrumbs"
      :item-count="users.length"
      count-suffix="个用户"
      @back="goBack"
    >
      <button class="header-btn" type="button" @click="loadUsers">
        刷新
      </button>
    </BreadcrumbHeader>

    <Transition name="page-message">
      <p v-if="messageText" class="floating-message" :class="messageType === 'error' ? 'floating-message--error' : 'floating-message--success'">
        {{ messageText }}
      </p>
    </Transition>

    <div class="user-layout">
      <section class="user-card user-card--form">
        <div class="user-card__head">
          <div>
            <h3>新增用户</h3>
            <p>用户名会作为用户目录名使用，第一阶段不可修改。</p>
          </div>
        </div>

        <div class="user-form-grid">
          <label class="user-field">
            <span>用户名</span>
            <input v-model.trim="createForm.username" type="text" placeholder="例如 inspector" :disabled="saving">
          </label>
          <label class="user-field">
            <span>显示名</span>
            <input v-model.trim="createForm.display_name" type="text" placeholder="可选" :disabled="saving">
          </label>
          <label class="user-field">
            <span>角色</span>
            <select v-model="createForm.role" :disabled="saving">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label class="user-field">
            <span>初始密码</span>
            <input v-model="createForm.password" type="password" placeholder="至少 4 位" :disabled="saving">
          </label>
        </div>

        <div class="user-card__actions">
          <button class="user-btn user-btn--primary" type="button" :disabled="saving" @click="submitCreateUser">
            {{ saving ? '创建中…' : '创建用户' }}
          </button>
        </div>
      </section>

      <section class="user-card user-card--list">
        <div class="user-card__head">
          <div>
            <h3>现有用户</h3>
            <p>admin 拥有完全权限；普通用户不会看到此页面。</p>
          </div>
        </div>

        <LoadingSpinner v-if="loading" />

        <div v-else class="user-list">
          <article v-for="user in users" :key="user.username" class="user-entry">
            <div class="user-entry__main">
              <div class="user-entry__title-row">
                <strong>{{ user.username }}</strong>
                <span class="user-badge" :class="user.role === 'admin' ? 'user-badge--admin' : 'user-badge--user'">
                  {{ roleLabel(user.role) }}
                </span>
                <span v-if="isCurrentUser(user)" class="user-badge user-badge--current">当前登录</span>
              </div>
              <p class="user-entry__display-name">{{ user.display_name || '未设置显示名' }}</p>
            </div>

            <div class="user-entry__actions">
              <button class="user-btn" type="button" :disabled="dialogBusy" @click="openResetPasswordDialog(user)">
                重置密码
              </button>
              <button class="user-btn user-btn--danger" type="button" :disabled="dialogBusy || isCurrentUser(user)" @click="openDeleteDialog(user)">
                删除
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <ConfirmationDialog
      :visible="dialog.visible"
      :title="dialog.title"
      :message="dialog.message"
      :confirm-label="dialog.confirmLabel"
      :cancel-label="dialog.cancelLabel"
      :tone="dialog.tone"
      :busy="dialogBusy"
      :busy-label="dialog.busyLabel"
      :input-visible="dialog.inputVisible"
      :input-label="dialog.inputLabel"
      :input-placeholder="dialog.inputPlaceholder"
      :input-hint="dialog.inputHint"
      :model-value="dialogInput"
      @update:modelValue="dialogInput = $event"
      @cancel="closeDialog"
      @confirm="handleDialogConfirm"
    />
  </section>
</template>

<script>
import BreadcrumbHeader from '../components/BreadcrumbHeader.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import { API_BASE } from '../utils/apiBase'
import { authState } from '../utils/auth'

function createDialogState() {
  return {
    visible: false,
    mode: '',
    title: '请确认操作',
    message: '',
    confirmLabel: '确认',
    cancelLabel: '取消',
    tone: 'danger',
    busyLabel: '处理中…',
    inputVisible: false,
    inputLabel: '',
    inputPlaceholder: '',
    inputHint: '',
    username: '',
  }
}

function toErrorMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export default {
  name: 'UserManagementPage',
  components: {
    BreadcrumbHeader,
    ConfirmationDialog,
    LoadingSpinner,
  },
  data() {
    return {
      authState,
      users: [],
      loading: false,
      saving: false,
      dialogBusy: false,
      dialogInput: '',
      dialog: createDialogState(),
      messageText: '',
      messageType: 'success',
      messageTimer: null,
      createForm: {
        username: '',
        display_name: '',
        role: 'user',
        password: '',
      },
    }
  },
  computed: {
    headerCrumbs() {
      return [
        { label: '设置', title: '设置', to: '/settings' },
        { label: '用户管理', title: '用户管理', current: true },
      ]
    },
  },
  created() {
    this.loadUsers()
  },
  beforeUnmount() {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer)
      this.messageTimer = null
    }
  },
  methods: {
    goBack() {
      this.$router.push('/settings')
    },
    roleLabel(role) {
      return role === 'admin' ? '管理员' : '普通用户'
    },
    isCurrentUser(user) {
      return user?.username && user.username === this.authState.user?.username
    },
    showMessage(type, text, duration = 2600) {
      if (this.messageTimer) {
        clearTimeout(this.messageTimer)
      }
      this.messageType = type
      this.messageText = text
      this.messageTimer = setTimeout(() => {
        this.messageText = ''
        this.messageTimer = null
      }, duration)
    },
    async loadUsers() {
      this.loading = true
      try {
        const res = await fetch(`${API_BASE}/api/users`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || `HTTP ${res.status}`)
        }
        const data = await res.json()
        this.users = Array.isArray(data.items) ? data.items : []
      } catch (err) {
        this.showMessage('error', `加载用户失败：${toErrorMessage(err)}`, 4200)
      } finally {
        this.loading = false
      }
    },
    async submitCreateUser() {
      if (!this.createForm.username || !this.createForm.password) {
        this.showMessage('error', '请填写用户名和初始密码。', 4200)
        return
      }

      this.saving = true
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.createForm),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || `HTTP ${res.status}`)
        }

        this.createForm = {
          username: '',
          display_name: '',
          role: 'user',
          password: '',
        }
        this.showMessage('success', '用户已创建。')
        await this.loadUsers()
      } catch (err) {
        this.showMessage('error', `创建用户失败：${toErrorMessage(err)}`, 4200)
      } finally {
        this.saving = false
      }
    },
    openResetPasswordDialog(user) {
      this.dialogInput = ''
      this.dialog = {
        visible: true,
        mode: 'reset-password',
        title: `重置 ${user.username} 的密码`,
        message: '请输入新的密码。保存后将立即生效。',
        confirmLabel: '保存密码',
        cancelLabel: '取消',
        tone: 'accent',
        busyLabel: '保存中…',
        inputVisible: true,
        inputLabel: '新密码',
        inputPlaceholder: '至少 4 位',
        inputHint: '开发阶段建议使用可记忆的测试密码。',
        username: user.username,
      }
    },
    openDeleteDialog(user) {
      this.dialogInput = ''
      this.dialog = {
        visible: true,
        mode: 'delete-user',
        title: `删除用户 ${user.username}`,
        message: '删除后会同步清理该用户自己的数据库、配置文件、媒体目录、回收站与临时目录，且不可恢复。',
        confirmLabel: '确认删除',
        cancelLabel: '取消',
        tone: 'danger',
        busyLabel: '删除中…',
        inputVisible: false,
        inputLabel: '',
        inputPlaceholder: '',
        inputHint: '',
        username: user.username,
      }
    },
    closeDialog() {
      if (this.dialogBusy) return
      this.dialog = createDialogState()
      this.dialogInput = ''
    },
    async handleDialogConfirm() {
      if (!this.dialog.username) return
      this.dialogBusy = true
      try {
        if (this.dialog.mode === 'reset-password') {
          if (String(this.dialogInput || '').length < 4) {
            throw new Error('密码长度至少为 4 位')
          }
          const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(this.dialog.username)}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: this.dialogInput }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.detail || `HTTP ${res.status}`)
          }
          this.showMessage('success', `已重置 ${this.dialog.username} 的密码。`)
        } else if (this.dialog.mode === 'delete-user') {
          const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(this.dialog.username)}`, {
            method: 'DELETE',
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.detail || `HTTP ${res.status}`)
          }
          this.showMessage('success', `已删除用户 ${this.dialog.username}。`)
        }

        this.closeDialog()
        await this.loadUsers()
      } catch (err) {
        this.showMessage('error', toErrorMessage(err), 4200)
      } finally {
        this.dialogBusy = false
      }
    },
  },
}
</script>

<style scoped lang="css">
.user-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.user-layout {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  gap: 1rem;
}

.user-card {
  border-radius: 24px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
  padding: 1.2rem;
}

.user-card__head h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.05rem;
  font-weight: 800;
}

.user-card__head p {
  margin: 0.4rem 0 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.65;
}

.user-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
  margin-top: 1rem;
}

.user-field {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.user-field span {
  color: #334155;
  font-size: 0.8rem;
  font-weight: 700;
}

.user-field input,
.user-field select {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  background: #fff;
  color: #0f172a;
  outline: none;
}

.user-field input:focus,
.user-field select:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.user-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  margin-top: 1rem;
}

.user-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(255, 255, 255, 0.98));
  padding: 1rem;
}

.user-entry__title-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.user-entry__display-name {
  margin: 0.4rem 0 0;
  color: #64748b;
  font-size: 0.84rem;
}

.user-entry__actions {
  display: flex;
  gap: 0.55rem;
}

.user-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.18rem 0.56rem;
  font-size: 0.72rem;
  font-weight: 800;
}

.user-badge--admin {
  background: rgba(219, 234, 254, 0.95);
  color: #1d4ed8;
}

.user-badge--user {
  background: rgba(226, 232, 240, 0.95);
  color: #334155;
}

.user-badge--current {
  background: rgba(220, 252, 231, 0.95);
  color: #166534;
}

.user-btn {
  border: 0;
  border-radius: 14px;
  padding: 0.7rem 0.9rem;
  background: rgba(226, 232, 240, 0.82);
  color: #1e293b;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
}

.user-btn--primary {
  background: linear-gradient(135deg, #0f172a, #1d4ed8);
  color: white;
}

.user-btn--danger {
  background: rgba(254, 226, 226, 0.92);
  color: #b91c1c;
}

.user-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.floating-message {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 50;
  padding: 0.7rem 0.9rem;
  border-radius: 14px;
  border: 1px solid transparent;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.floating-message--success {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.floating-message--error {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}

@media (max-width: 960px) {
  .user-layout {
    grid-template-columns: 1fr;
  }

  .user-entry {
    flex-direction: column;
    align-items: stretch;
  }

  .user-entry__actions {
    justify-content: flex-end;
  }
}
</style>